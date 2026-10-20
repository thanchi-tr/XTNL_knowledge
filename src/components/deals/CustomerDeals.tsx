"use client";

/**
 * A customer's Deals tab (Phase 2, 2026-10-20; deals.ts): their deals, the open ones first (with their open value), then
 * the won and lost ones, newest closed first; each card with its stage, "Move to…", and once Won, "Create order".
 * "Add deal" starts one for them (the customer fixed). Nothing yet: one calm line.
 */
import { formatMoney, openDealsOf, type DealView } from "@/lib/deals";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { DealCard, useDealSheets } from "./DealCard";

export function CustomerDeals({
  board,
  customer,
  deals,
  today,
}: {
  board: { id: string; name: string; ordersOn: boolean };
  customer: { id: string; number: string; name: string };
  /** Null: they could not be read. */
  deals: DealView[] | null;
  today: DayKey;
}) {
  const sheets = useDealSheets(board, today, { fixedCustomer: true });
  const open = deals ? openDealsOf(deals) : null;
  return (
    <section className="card crm-sec" aria-labelledby="crm-deals-h">
      <div className="crm-sec-h">
        <h2 id="crm-deals-h">Deals</h2>
        {open && open.count > 0 && <span className="t-meta crm-money">{formatMoney(open.valueCents)} open</span>}
        <Button variant="secondary" icon="plus" onClick={() => sheets.openNew(customer)} aria-haspopup="dialog">
          Add deal
        </Button>
      </div>
      {sheets.error && (
        <p className="crm-error" role="alert" style={{ padding: "0 14px" }}>
          {sheets.error}
        </p>
      )}
      {deals === null ? (
        <p className="crm-sec-note">Their deals couldn&apos;t be read. Try again in a moment.</p>
      ) : deals.length === 0 ? (
        <p className="crm-sec-note">No deals for {customer.name} yet. Add one: what it is, its value and where it stands.</p>
      ) : (
        <ol className="dl-list dl-list-flat">
          {deals.map((d) => (
            <DealCard
              key={d.id}
              deal={d}
              today={today}
              boardId={board.id}
              showCustomer={false}
              showStage
              busy={sheets.busy === d.id}
              onEdit={() => sheets.openEdit(d)}
              onMove={(to) => sheets.move(d, to)}
              onCreateOrder={() => (board.ordersOn ? sheets.openOrder(d) : sheets.openEdit(d))}
            />
          ))}
        </ol>
      )}
      {sheets.node}
    </section>
  );
}
