import type { Metadata } from "next";
import "@/components/customers/customers.css";
import "@/components/orders/orders.css";
import "@/components/deals/deals.css";
import { notFound } from "next/navigation";
import { getCurrentUserId } from "@/lib/user";
import { loadDealsPage } from "@/lib/deals-server";
import { ShellTitle } from "@/components/shell/ShellTitle";
import { CrmGate } from "@/components/customers/CrmGate";
import { DealsView } from "@/components/deals/DealsView";

// "Close by", "Overdue" and Won's day turn on the clock: never statically cache it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Deals" };

/**
 * A work tab's deals pipeline (deals.ts; /today/work/<id>/deals; Phase 2, 2026-10-20): New · Quoted · Won · Lost, each
 * with its count and value, side by side on a desktop and one at a time (a stage switch) on a phone; Add deal, Move to…,
 * and a Won deal's Create order. The tab stays the current tab in the strip (nav.ts activeSub reads the board from the
 * path); the title reads "<tab> · Deals". Deals live with the customer list: a tab whose list is off says so (one tap
 * turns it on); an archived tab says so; an unknown one is a 404.
 */
export default async function DealsPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const page = await loadDealsPage(getCurrentUserId(), boardId, new Date());
  if (page.kind === "gone") notFound();

  return (
    <>
      <ShellTitle eyebrow={page.board.name} title="Deals" />
      {page.kind === "ok" ? (
        <DealsView board={page.board} deals={page.deals} today={page.today} />
      ) : (
        <CrmGate board={page.board} kind={page.kind} offNote="Deals live with the customer list. Turning it on brings back every customer and every deal. Nothing was deleted." />
      )}
    </>
  );
}
