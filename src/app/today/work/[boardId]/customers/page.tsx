import type { Metadata } from "next";
import "@/components/customers/customers.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadCustomersPage } from "@/lib/customers-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CrmGate } from "@/components/customers/CrmGate";
import { CustomersView } from "@/components/customers/CustomersView";

// Due counts turn on the clock: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Customers" };

/**
 * A work tab's customer list (customers.ts; /today/work/<id>/customers): the
 * search by customer ID, the customers due today, everyone by ID, Add
 * customer, and the archived ones folded at the bottom. The tab stays the
 * current tab in the strip (nav.ts activeSub reads the board from the path);
 * the title's eyebrow is the tab's name. An archived tab, or one whose list
 * is off, says so; an unknown tab is a 404.
 */
export default async function CustomersPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const page = await loadCustomersPage(getCurrentUserId(), boardId, new Date());
  if (page.kind === "gone") notFound();

  return (
    <>
      <ShellTitle eyebrow={page.board.name} title="Customers" />
      {page.kind === "ok" ? (
        <CustomersView board={page.board} customers={page.customers} archived={page.archived} numeric={page.numeric} suggestion={page.suggestion} />
      ) : (
        <CrmGate board={page.board} kind={page.kind} />
      )}
    </>
  );
}
