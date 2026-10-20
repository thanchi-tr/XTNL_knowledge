import type { Metadata } from "next";
import "@/components/customers/customers.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadCustomersPage } from "@/lib/customers-server";
import { loadFollowUps } from "@/lib/crm-server";
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
 * is off, says so; an unknown tab is a 404. Phase 2 (crm.ts): the status and tag filters, and the customers who need
 * a follow-up first (crm-server loadFollowUps, read in the same wave; a failed read is no group).
 */
export default async function CustomersPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const now = new Date();
  const [page, follow] = await Promise.all([
    loadCustomersPage(getCurrentUserId(), boardId, now),
    loadFollowUps(getCurrentUserId(), boardId, now).catch((err) => {
      console.error("[crm] follow-ups read failed", err);
      return null;
    }),
  ]);
  if (page.kind === "gone") notFound();

  return (
    <>
      <ShellTitle eyebrow={page.board.name} title="Customers" />
      {page.kind === "ok" ? (
        <CustomersView board={page.board} customers={page.customers} archived={page.archived} numeric={page.numeric} suggestion={page.suggestion} followUps={follow && follow.days !== null ? follow.rows : null} />
      ) : (
        <CrmGate board={page.board} kind={page.kind} />
      )}
    </>
  );
}
