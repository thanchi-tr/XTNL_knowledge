"use client";

/**
 * A customer's Tasks tab (their scheduled tasks, scheduled-tasks.ts, the Agenda's own rows: Done, Snooze, a tap to edit,
 * one reminder each), grouped by task collection since Phase 2 (2026-10-20; crm.ts groupByCollection): each open
 * collection with its progress ("2 of 5 done", and a thin bar), its linked order as a chip, "Add a task" (the sheet,
 * this customer and collection set) and Close; then "No collection" last; the closed collections folded at the bottom,
 * each with Open again. With no collection yet it is the plain list it was (open soonest first, Done folded).
 * "Schedule a task" and "New collection" start either. `?task=<id>` highlights that task and scrolls it into view (a
 * done one opens its fold).
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { closeTaskCollection } from "@/app/actions/crm";
import { groupByCollection, progressLabel, type CollectionGroup, type CollectionOrderRef, type CollectionView } from "@/lib/crm";
import { sectionOfTask, taskAnchorId, type ScheduledView } from "@/lib/scheduled-tasks";
import { ordersHref } from "@/lib/work-orders";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { pushToast } from "@/components/ui/toast-store";
import { ScheduledRow } from "@/components/work/ScheduledRow";
import { useScheduledActions } from "@/components/work/useScheduledActions";
import { openScheduledSheet } from "@/components/work/work-store";
import { CollectionSheet, type CollectionFormValue } from "./CollectionSheet";
import { UNREACHABLE } from "./CustomerSheets";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export function CustomerTasks({
  boardId,
  customer,
  tasks,
  collections,
  highlightTask,
  now,
  ordersOn,
  orderRefs,
}: {
  boardId: string;
  customer: { id: string; number: string; name: string };
  /** Their scheduled tasks: open soonest first, then the done ones. */
  tasks: ScheduledView[];
  /** Their collections, open and closed. */
  collections: CollectionView[];
  highlightTask: string | null;
  now: Date;
  ordersOn: boolean;
  /** Their orders (the collection sheet's picker), when the page read them. */
  orderRefs: CollectionOrderRef[] | null;
}) {
  const actions = useScheduledActions();
  const [, start] = useTransition();
  const grouped = useMemo(() => groupByCollection(tasks, collections), [tasks, collections]);
  const overdue = tasks.filter((t) => !t.doneAt && sectionOfTask(t, now) === "overdue").length;
  const hlTask = highlightTask ? (tasks.find((t) => t.id === highlightTask) ?? null) : null;
  const [sheet, setSheet] = useState<{ editing: CollectionView | null; initial: CollectionFormValue } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);

  useEffect(() => {
    if (!highlightTask) return;
    const el = document.getElementById(taskAnchorId(highlightTask));
    el?.scrollIntoView({ block: "center" });
  }, [highlightTask]);

  function showSheet(editing: CollectionView | null, initial: CollectionFormValue) {
    setSheetKey((k) => k + 1);
    setSheet({ editing, initial });
    setSheetOpen(true);
  }

  function setClosed(c: CollectionView, closed: boolean) {
    start(async () => {
      const res = await call(() => closeTaskCollection(c.id, closed, { refresh: true }));
      if (!res.ok) {
        pushToast({ title: "Couldn't save that", body: res.error });
        return;
      }
      pushToast({
        key: `coll-close-${c.id}`,
        title: closed ? "Collection closed" : "Collection open again",
        body: c.name,
        action: closed ? { label: "Undo", onAction: () => void call(() => closeTaskCollection(c.id, false, { refresh: true })) } : undefined,
      });
    });
  }

  const row = (t: ScheduledView) => (
    <ScheduledRow
      key={t.id}
      task={t}
      now={now}
      section={sectionOfTask(t, now) ?? "done"}
      highlighted={t.id === highlightTask}
      busy={actions.busy === t.id}
      showCustomer={false}
      showCollection={false}
      onDone={() => actions.done(t)}
      onReopen={() => actions.reopen(t)}
      onSnooze={(p) => actions.snooze(t, p)}
      onEdit={() => openScheduledSheet({ task: t })}
    />
  );

  const doneFold = (g: CollectionGroup<ScheduledView>) =>
    g.done.length > 0 && (
      <details className="crm-done" open={hlTask?.doneAt && g.done.some((t) => t.id === hlTask.id) ? true : undefined}>
        <summary>
          <Icon name="chev" />
          Done · {g.done.length}
        </summary>
        <ol className="st-list">{g.done.slice(0, 20).map(row)}</ol>
      </details>
    );

  const group = (g: CollectionGroup<ScheduledView>) => {
    const c = g.collection;
    const pct = g.progress.total > 0 ? Math.round((g.progress.done / g.progress.total) * 100) : 0;
    return (
      <div key={c?.id ?? "none"} className="crm-coll" data-closed={c?.closedAt ? "" : undefined} data-none={c ? undefined : ""}>
        <div className="crm-coll-h">
          {c ? (
            <button type="button" className="crm-coll-name" onClick={() => showSheet(c, { name: c.name, note: c.note ?? "", orderId: c.order?.id ?? "" })} aria-haspopup="dialog" aria-label={`Edit collection ${c.name}: ${progressLabel(g.progress)}`}>
              <b>{c.name}</b>
              <span className="crm-coll-prog">{progressLabel(g.progress)}</span>
            </button>
          ) : (
            <span className="crm-coll-name">
              <b>No collection</b>
              <span className="crm-coll-prog">
                {g.open.length + g.done.length} task{g.open.length + g.done.length === 1 ? "" : "s"}
              </span>
            </span>
          )}
          {c && !c.closedAt && (
            <button type="button" className="crm-coll-act" onClick={() => openScheduledSheet({ customer, collection: { id: c.id, name: c.name } })} aria-haspopup="dialog" aria-label={`Add a task to ${c.name}`}>
              <Icon name="plus" />
            </button>
          )}
          {c && (
            <Button variant="quiet" className="crm-coll-close" onClick={() => setClosed(c, !c.closedAt)}>
              {c.closedAt ? "Open again" : "Close"}
            </Button>
          )}
        </div>
        {c && (c.order || g.progress.total > 0) && (
          <div className="crm-coll-meta">
            {g.progress.total > 0 && (
              <span className="crm-coll-bar" role="img" aria-label={progressLabel(g.progress)}>
                <span style={{ width: `${pct}%` }} />
              </span>
            )}
            {c.order &&
              (ordersOn ? (
                <Link className="st-chip crm-coll-order" href={ordersHref(boardId)}>
                  <span className="sr-only">Order: </span>
                  {c.order.item}
                  {c.order.ordered ? " · ordered" : ""}
                </Link>
              ) : (
                <span className="st-coll crm-coll-order">
                  <span className="sr-only">Order: </span>
                  {c.order.item}
                </span>
              ))}
          </div>
        )}
        {c?.note && <p className="crm-coll-note">{c.note}</p>}
        {g.open.length > 0 && <ol className="st-list">{g.open.map(row)}</ol>}
        {doneFold(g)}
        {c && g.open.length === 0 && g.done.length === 0 && <p className="crm-sec-note">No tasks yet. Add one with +.</p>}
      </div>
    );
  };

  const flat = collections.length === 0;
  const empty = tasks.length === 0 && collections.length === 0;
  return (
    <section className="card crm-sec" aria-labelledby="crm-sched-h">
      <div className="crm-sec-h">
        <h2 id="crm-sched-h">Tasks</h2>
        {overdue > 0 && <span className="chip owed">{overdue} overdue</span>}
        <Button variant="secondary" icon="plus" onClick={() => openScheduledSheet({ customerId: customer.id })} aria-haspopup="dialog">
          Schedule a task
        </Button>
      </div>
      {highlightTask && !hlTask && <p className="crm-sec-note">That task is no longer here.</p>}
      {actions.error && (
        <p className="crm-error" role="alert" style={{ padding: "0 14px" }}>
          {actions.error}
        </p>
      )}
      {empty ? (
        <p className="crm-sec-note">Nothing scheduled. A task here shows on the tab&apos;s agenda and reminds you at its time. Group the tasks of one job (a new service, an order) in a collection.</p>
      ) : flat ? (
        <>
          {grouped.none && grouped.none.open.length > 0 ? <ol className="st-list">{grouped.none.open.map(row)}</ol> : <p className="crm-sec-note">Nothing open. Every task here is done.</p>}
          {grouped.none && doneFold(grouped.none)}
        </>
      ) : (
        <>
          {grouped.open.map(group)}
          {grouped.none && group(grouped.none)}
        </>
      )}
      <div className="crm-coll-new">
        <Button variant="quiet" icon="plus" onClick={() => showSheet(null, { name: "", note: "", orderId: "" })} aria-haspopup="dialog">
          New collection
        </Button>
      </div>
      {grouped.closed.length > 0 && (
        <details className="crm-done crm-coll-closed">
          <summary>
            <Icon name="chev" />
            Closed collections · {grouped.closed.length}
          </summary>
          {grouped.closed.map(group)}
        </details>
      )}

      {sheet && (
        <CollectionSheet
          key={sheetKey}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          customer={customer}
          editing={sheet.editing}
          initial={sheet.initial}
          ordersOn={ordersOn}
          orders={orderRefs}
        />
      )}
    </section>
  );
}
