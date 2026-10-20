"use client";

/**
 * A work tab's deals pipeline (/today/work/<id>/deals; deals.ts), in the Office workspace's frame. The head: the open
 * deals' value and count, what has been won, and "Add deal". The four columns, New · Quoted · Won · Lost, each with its
 * count and total value: side by side from 900 px; below that one column at a time, chosen with a segmented stage
 * switch (a radio group, each segment "Quoted 2"; ?stage= kept with replaceState), so a 344 px phone never scrolls
 * sideways. A card moves with its "Move to…" menu (no drag; Undo in the dock); a Won one offers "Create order". ?new=1
 * (the header's New › Deal) opens "Add deal" on arrival. Nothing yet: one calm card and "Add the first deal".
 */
import { useEffect, useId, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEAL_STAGES, DEAL_STAGE_LABEL, STAGE_PARAM, formatMoney, openDealsOf, pipelineOf, stageParamOf, stageTotalLine, stageTotalsOf, type DealStage, type DealView, type DealsBoardView } from "@/lib/deals";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { DealCard, useDealSheets } from "./DealCard";

export function DealsView({ board, deals, today }: { board: DealsBoardView; deals: DealView[]; today: DayKey }) {
  const id = useId();
  const searchParams = useSearchParams();
  const [stage, setStage] = useState<DealStage>(() => stageParamOf(searchParams.get(STAGE_PARAM)));
  const sheets = useDealSheets(board, today);
  const columns = useMemo(() => pipelineOf(deals), [deals]);
  const totals = useMemo(() => stageTotalsOf(deals), [deals]);
  const open = openDealsOf(deals);

  // The header's New › Deal (?new=1) opens the sheet on arrival; the parameter then leaves the address.
  const wantsNew = searchParams.get("new") === "1";
  const { openNew } = sheets;
  useEffect(() => {
    if (!wantsNew) return;
    const raf = window.requestAnimationFrame(() => {
      openNew();
      const params = new URLSearchParams(window.location.search);
      params.delete("new");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [wantsNew, openNew]);

  /** The phone's one column, in the address (replaceState: no history entry per tap). */
  function pick(s: DealStage) {
    setStage(s);
    const params = new URLSearchParams(window.location.search);
    if (s === "NEW") params.delete(STAGE_PARAM);
    else params.set(STAGE_PARAM, s.toLowerCase());
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }

  return (
    <div className="page cq-main dl-page">
      <section className="card dl-head" aria-labelledby={`${id}-sum`}>
        <div className="dl-head-top">
          <p className="dl-sum" id={`${id}-sum`}>
            <span>
              <b className="crm-money">{formatMoney(open.valueCents)}</b> open · {open.count} deal{open.count === 1 ? "" : "s"}
            </span>
            {totals.WON.count > 0 && <span className="dl-sum-won">Won {formatMoney(totals.WON.valueCents)}</span>}
          </p>
          <Button variant="primary" icon="plus" onClick={() => sheets.openNew()} aria-haspopup="dialog">
            Add deal
          </Button>
        </div>
        {deals.length > 0 && (
          <fieldset className="dl-switch">
            <legend className="sr-only">Show the stage</legend>
            {DEAL_STAGES.map((s) => (
              <label key={s} className="dl-seg">
                <input type="radio" name={`${id}-stage`} value={s} checked={stage === s} onChange={() => pick(s)} />
                {DEAL_STAGE_LABEL[s]}
                <span className="ord-n">{totals[s].count}</span>
              </label>
            ))}
          </fieldset>
        )}
      </section>

      {sheets.error && (
        <p className="crm-error" role="alert">
          {sheets.error}
        </p>
      )}

      {deals.length === 0 ? (
        <section className="card crm-empty" aria-label="No deals yet">
          <h2>No deals yet</h2>
          <p>Add a deal: what it is, what it is worth and where it stands (New, Quoted, Won or Lost). A won deal becomes an order in one tap.</p>
          <Button variant="primary" icon="plus" onClick={() => sheets.openNew()} aria-haspopup="dialog">
            Add the first deal
          </Button>
        </section>
      ) : (
        <div className="dl-board">
          {DEAL_STAGES.map((s) => {
            const hid = `${id}-col-${s}`;
            return (
              <section key={s} className="card dl-col" data-stage={s} data-active={stage === s ? "" : undefined} aria-labelledby={hid}>
                <h2 id={hid} className="dl-col-h">
                  <span className="wk-sec-t">{DEAL_STAGE_LABEL[s]}</span>
                  <span className="dl-col-total">{stageTotalLine(totals[s])}</span>
                </h2>
                {columns[s].length === 0 ? (
                  <p className="crm-sec-note">No deals here.</p>
                ) : (
                  <ol className="dl-list">
                    {columns[s].map((d) => (
                      <DealCard
                        key={d.id}
                        deal={d}
                        today={today}
                        boardId={board.id}
                        busy={sheets.busy === d.id}
                        onEdit={() => sheets.openEdit(d)}
                        onMove={(to) => sheets.move(d, to)}
                        onCreateOrder={() => (board.ordersOn ? sheets.openOrder(d) : sheets.openEdit(d))}
                      />
                    ))}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      )}
      {sheets.node}
    </div>
  );
}
