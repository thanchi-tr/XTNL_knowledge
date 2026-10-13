import type { Metadata } from "next";
import "@/components/customers/customers.css";
import "@/components/orders/orders.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadOrdersPage } from "@/lib/work-orders-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { OrdersGate } from "@/components/orders/OrdersGate";
import { OrdersView } from "@/components/orders/OrdersView";

// Overdue turns on the day: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Orders" };

/**
 * A work tab's order list (work-orders.ts; /today/work/<id>/orders): the
 * counts, the To order · Ordered · All filter, the lines (each with its
 * Ordered tick) and Add order. The tab stays the current tab in the strip
 * (nav.ts activeSub reads the board from the path); the title's eyebrow is
 * the tab's name. An archived tab, or one whose list is off, says so; an
 * unknown tab is a 404.
 */
export default async function OrdersPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const page = await loadOrdersPage(getCurrentUserId(), boardId, new Date());
  if (page.kind === "gone") notFound();

  return (
    <>
      <ShellTitle eyebrow={page.board.name} title="Orders" />
      {page.kind === "ok" ? <OrdersView board={page.board} orders={page.orders} customers={page.customers} today={page.today} /> : <OrdersGate board={page.board} kind={page.kind} />}
    </>
  );
}
