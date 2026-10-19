import type { Metadata } from "next";
import "@/components/customers/customers.css";
import "@/components/orders/orders.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadCustomerPage } from "@/lib/customers-server";
import { loadCustomerOrders } from "@/lib/work-orders-server";
import { resolveTaskParam } from "@/lib/scheduled-tasks-server";
import { TASK_PARAM, taskParamOf } from "@/lib/customers";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CrmGate } from "@/components/customers/CrmGate";
import { CustomerView } from "@/components/customers/CustomerView";
import { CustomerOrders } from "@/components/orders/CustomerOrders";

// Overdue turns on the clock: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customer" };

/**
 * One customer on a work tab (customers.ts; /today/work/<id>/customers/<customerId>):
 * their details, their scheduled tasks (scheduled-tasks.ts, with Done, Snooze
 * and a tap to edit), their infos and interaction log. `?task=<id>` (an old
 * customer task reminder's tap URL; the id is a scheduled task's, or the
 * customer task it was backfilled from) highlights that task and scrolls it
 * into view. A customer on another tab, or an unknown one, is a 404; an
 * archived tab, or one whose list is off, says so. While the tab's order list
 * is on (work-orders.ts), their orders are read in the same wave and drawn
 * after the log; a failed read is no section, never a broken page.
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
  const [page, orders, focus] = await Promise.all([
    loadCustomerPage(getCurrentUserId(), boardId, customerId),
    loadCustomerOrders(getCurrentUserId(), boardId, customerId, now).catch((err) => {
      console.error("[orders] customer read failed", err);
      return null;
    }),
    asked ? resolveTaskParam(getCurrentUserId(), asked).catch(() => null) : Promise.resolve(null),
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

  return (
    <>
      <ShellTitle eyebrow={page.board.name} title={page.customer.name} />
      <CustomerView
        board={page.board}
        customer={page.customer}
        tasks={page.tasks}
        infos={page.infos}
        interactions={page.interactions}
        highlightTask={asked ? (focus?.id ?? asked) : null}
        nowIso={now.toISOString()}
        orders={
          orders && (
            <CustomerOrders
              board={page.board}
              customer={{ id: page.customer.id, number: page.customer.number, name: page.customer.name, phone: page.customer.phone }}
              orders={orders.orders}
              today={orders.today}
            />
          )
        }
      />
    </>
  );
}
