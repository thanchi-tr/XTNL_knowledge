import type { Metadata } from "next";
import "@/components/customers/customers.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadCustomerPage } from "@/lib/customers-server";
import { TASK_PARAM, taskParamOf } from "@/lib/customers";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CrmGate } from "@/components/customers/CrmGate";
import { CustomerView } from "@/components/customers/CustomerView";

// Overdue turns on the clock: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customer" };

/**
 * One customer on a work tab (customers.ts; /today/work/<id>/customers/<customerId>):
 * their details, their scheduled tasks and interaction log, and the call
 * backs linked to them. `?task=<id>` is a task reminder's tap URL
 * (customerHref with a task): that task is highlighted and scrolled into
 * view. A customer on another tab, or an unknown one, is a 404; an archived
 * tab, or one whose list is off, says so.
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
  const page = await loadCustomerPage(getCurrentUserId(), boardId, customerId, now);
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
        interactions={page.interactions}
        callBacks={page.callBacks}
        highlightTask={taskParamOf(query[TASK_PARAM])}
        nowIso={now.toISOString()}
      />
    </>
  );
}
