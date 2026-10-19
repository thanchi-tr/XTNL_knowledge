"use client";

/**
 * One customer (/today/work/<id>/customers/<customerId>; customers.ts): their
 * name, nickname, ID and phone (a 44 px tap-to-call), Edit (and Archive,
 * inside it); "Scheduled": their scheduled tasks (scheduled-tasks.ts, the
 * Agenda's own rows: open ones soonest first with the overdue in owed ink,
 * each with Done, Snooze, a tap to edit, and its one reminder; then the done
 * ones, folded), and "Schedule a task" (the work frame's sheet, this customer
 * set); "Info": what is known about them, newest recorded first (the detail,
 * three lines then "More", and when it was recorded), each editable and
 * archivable (with Undo); "Interactions": the log, newest first (Call, Visit,
 * Email and Message too), each entry editable and archivable (with Undo).
 * `?task=<id>` highlights that task and scrolls it into view. While the tab's
 * order list is on, the page hands in their "Orders" section
 * (components/orders/CustomerOrders.tsx), drawn after the log.
 */
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addCustomerInfo,
  addInteraction,
  archiveCustomer,
  archiveCustomerInfo,
  archiveInteraction,
  editCustomer,
  editCustomerInfo,
  editInteraction,
  restoreCustomer,
  restoreCustomerInfo,
  restoreInteraction,
} from "@/app/actions/customers";
import {
  CUSTOMER_ACTION_LABEL,
  customersHref,
  infoLooksLong,
  infoRecordedLabel,
  localInputOf,
  phoneHref,
  whenLabel,
  type CrmBoardView,
  type CustomerDetail,
  type CustomerInfoView,
  type InteractionView,
} from "@/lib/customers";
import { sectionOfTask, taskAnchorId, type ScheduledView } from "@/lib/scheduled-tasks";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { pushToast } from "@/components/ui/toast-store";
import { ActionMark } from "@/components/work/ChannelGlyph";
import { ScheduledRow } from "@/components/work/ScheduledRow";
import { useScheduledActions } from "@/components/work/useScheduledActions";
import { openScheduledSheet } from "@/components/work/work-store";
import { CustomerFormSheet, InfoSheet, InteractionSheet, UNREACHABLE, type InfoFormValue, type InteractionFormValue } from "./CustomerSheets";

type Sheet =
  | { kind: "edit" }
  | { kind: "entry"; entry: InteractionView | null; initial: InteractionFormValue }
  | { kind: "info"; info: CustomerInfoView | null; initial: InfoFormValue }
  | null;

async function call<T>(fn: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/** A toast's Undo: the restore, and a word when it could not be made. */
function undo(fn: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }>) {
  void call(fn).then((res) => {
    if (!res.ok) pushToast({ title: "Couldn't undo that", body: res.error });
  });
}

/**
 * One info: the detail (three lines, then "More" while it runs longer; the
 * row is measured, a long one is assumed until it is) and when it was
 * recorded. Tapping it opens its sheet.
 */
function InfoRow({ info, now, onOpen }: { info: CustomerInfoView; now: Date; onOpen: () => void }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [long, setLong] = useState(() => infoLooksLong(info.detail));
  useEffect(() => {
    const el = ref.current;
    if (!el || expanded || typeof ResizeObserver === "undefined") return;
    // The observer reports once at once, then on every width change: three lines either hold the detail or not.
    const ro = new ResizeObserver(() => setLong(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [info.detail, expanded]);
  const recorded = infoRecordedLabel(new Date(info.recordedAt), now);
  return (
    <li className="crm-info">
      <button type="button" className="crm-info-btn" onClick={onOpen} aria-haspopup="dialog">
        <span className="sr-only">Edit info: </span>
        <span ref={ref} className="crm-info-d" data-open={expanded ? "" : undefined}>
          {info.detail}
        </span>
        <time className="crm-info-t" dateTime={info.recordedAt}>
          {recorded}
        </time>
      </button>
      {(long || expanded) && (
        <button type="button" className="crm-info-more" aria-expanded={expanded} onClick={() => setExpanded((x) => !x)}>
          {expanded ? "Less" : "More"}
        </button>
      )}
    </li>
  );
}

export function CustomerView({
  board,
  customer,
  tasks,
  infos,
  interactions,
  highlightTask,
  nowIso,
  orders = null,
}: {
  board: CrmBoardView;
  customer: CustomerDetail;
  /** Their scheduled tasks: open soonest first, then the done ones, newest first. */
  tasks: ScheduledView[];
  /** What is known about them, newest recorded first. */
  infos: CustomerInfoView[];
  interactions: InteractionView[];
  /** `?task=<id>`: the task a link asked for (resolved by the page). */
  highlightTask: string | null;
  nowIso: string;
  /** Their lines on the tab's order list (the page draws it only while that list is on). */
  orders?: ReactNode;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  // The sheet's data stays after it closes, so it slides away (and gives focus back) before the next one replaces it.
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const actions = useScheduledActions();
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [, start] = useTransition();

  const open = tasks.filter((t) => !t.doneAt);
  const done = tasks.filter((t) => t.doneAt);
  const overdue = open.filter((t) => sectionOfTask(t, now) === "overdue").length;
  const hlTask = highlightTask ? tasks.find((t) => t.id === highlightTask) ?? null : null;

  useEffect(() => {
    if (!highlightTask) return;
    const el = document.getElementById(taskAnchorId(highlightTask));
    el?.scrollIntoView({ block: "center" });
  }, [highlightTask]);

  function show(next: Exclude<Sheet, null>) {
    setSheetKey((k) => k + 1);
    setSheet(next);
    setSheetOpen(true);
    setConfirmArchive(false);
    setError(null);
  }

  const close = () => setSheetOpen(false);

  const taskRow = (t: ScheduledView) => (
    <ScheduledRow
      key={t.id}
      task={t}
      now={now}
      section={sectionOfTask(t, now) ?? "done"}
      highlighted={t.id === highlightTask}
      busy={actions.busy === t.id}
      showCustomer={false}
      onDone={() => actions.done(t)}
      onReopen={() => actions.reopen(t)}
      onSnooze={(p) => actions.snooze(t, p)}
      onEdit={() => openScheduledSheet({ task: t })}
    />
  );

  function newInfo() {
    show({ kind: "info", info: null, initial: { detail: "", when: localInputOf(new Date()) } });
  }

  function editInfo(i: CustomerInfoView) {
    show({ kind: "info", info: i, initial: { detail: i.detail, when: localInputOf(new Date(i.recordedAt)) } });
  }

  function newEntry() {
    show({ kind: "entry", entry: null, initial: { when: localInputOf(new Date()), action: null, brief: "" } });
  }

  function editEntry(e: InteractionView) {
    show({ kind: "entry", entry: e, initial: { when: localInputOf(new Date(e.at)), action: e.action, brief: e.brief } });
  }

  function archiveThisCustomer() {
    setArchiving(true);
    start(async () => {
      const res = await call(() => archiveCustomer(customer.id));
      setArchiving(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSheetOpen(false);
      pushToast({
        key: `crm-arch-${customer.id}`,
        title: `${customer.name} archived`,
        body: "Out of the search. Restore them from Archived.",
        action: { label: "Undo", onAction: () => undo(() => restoreCustomer(customer.id, { refresh: true })) },
      });
      router.push(customersHref(board.id));
    });
  }

  function restoreThisCustomer() {
    setArchiving(true);
    start(async () => {
      const res = await call(() => restoreCustomer(customer.id, { refresh: true }));
      setArchiving(false);
      if (!res.ok) setError(res.error);
    });
  }

  if (customer.archived) {
    return (
      <div className="page narrow cq-main crm-page">
        <Link className="crm-back" href={customersHref(board.id)}>
          <Icon name="back" />
          Customers
        </Link>
        <section className="card crm-note" aria-label={`${customer.name} is archived`}>
          <b>
            #{customer.number} {customer.name} is archived
          </b>
          <p>They are out of the search, and their tasks send no reminders. Everything about them is kept.</p>
          <div className="crm-note-row">
            <Button variant="primary" onClick={restoreThisCustomer} disabled={archiving}>
              {archiving ? "Restoring…" : "Restore"}
            </Button>
          </div>
          {error && (
            <p className="crm-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="page narrow cq-main crm-page">
      <Link className="crm-back" href={customersHref(board.id)}>
        <Icon name="back" />
        Customers
      </Link>

      <section className="card crm-head" aria-label={`Customer ${customer.name}`}>
        <div className="crm-head-top">
          <div className="crm-head-names">
            <span className="crm-num">#{customer.number}</span>
            <h2>{customer.name}</h2>
            {customer.nickname && <span className="t-meta">Nickname: {customer.nickname}</span>}
          </div>
          <Button variant="quiet" onClick={() => show({ kind: "edit" })} aria-haspopup="dialog">
            Edit
          </Button>
        </div>
        {customer.phone ? (
          <a className="btn btn-secondary btn-block crm-call" href={phoneHref(customer.phone)}>
            Call {customer.phone}
          </a>
        ) : (
          <p className="t-meta" style={{ margin: 0 }}>
            No phone number. Edit adds one.
          </p>
        )}
      </section>

      {(error || actions.error) && !sheetOpen && (
        <p className="crm-error" role="alert">
          {error ?? actions.error}
        </p>
      )}

      <section className="card crm-sec" aria-labelledby="crm-sched-h">
        <div className="crm-sec-h">
          <h2 id="crm-sched-h">Scheduled</h2>
          {overdue > 0 && <span className="chip owed">{overdue} overdue</span>}
          <Button variant="secondary" icon="plus" onClick={() => openScheduledSheet({ customerId: customer.id })} aria-haspopup="dialog">
            Schedule a task
          </Button>
        </div>
        {highlightTask && !hlTask && <p className="crm-sec-note">That task is no longer here.</p>}
        {open.length === 0 ? (
          <p className="crm-sec-note">Nothing scheduled. A task here shows on the tab&apos;s agenda and reminds you at its time.</p>
        ) : (
          <ol className="st-list">{open.map(taskRow)}</ol>
        )}
        {done.length > 0 && (
          <details className="crm-done" open={hlTask?.doneAt ? true : undefined}>
            <summary>
              <Icon name="chev" />
              Done · {done.length}
            </summary>
            <ol className="st-list">{done.slice(0, 20).map(taskRow)}</ol>
          </details>
        )}
      </section>

      <section className="card crm-sec" aria-labelledby="crm-info-h">
        <div className="crm-sec-h">
          <h2 id="crm-info-h">Info</h2>
          {infos.length > 0 && <span className="t-meta">{infos.length}</span>}
          <Button variant="secondary" icon="plus" onClick={newInfo} aria-haspopup="dialog">
            Add info
          </Button>
        </div>
        {infos.length === 0 ? (
          <p className="crm-sec-note">Nothing recorded yet. Note what you learn about them: what they like, sizes, who to ask for.</p>
        ) : (
          <ol className="crm-infos">
            {infos.map((i) => (
              <InfoRow key={i.id} info={i} now={now} onOpen={() => editInfo(i)} />
            ))}
          </ol>
        )}
      </section>

      <section className="card crm-sec" aria-labelledby="crm-log-h">
        <div className="crm-sec-h">
          <h2 id="crm-log-h">Interactions</h2>
          {interactions.length > 0 && <span className="t-meta">{interactions.length}</span>}
          <Button variant="secondary" icon="plus" onClick={newEntry} aria-haspopup="dialog">
            Add entry
          </Button>
        </div>
        {interactions.length === 0 ? (
          <p className="crm-sec-note">No interactions yet. Log a call, a visit, an email, a message, a purchase, an inquiry, a complaint or a credit check.</p>
        ) : (
          <ol className="crm-log">
            {interactions.map((e) => (
              <li key={e.id}>
                <button type="button" className="crm-entry-btn" onClick={() => editEntry(e)} aria-label={`Edit entry: ${CUSTOMER_ACTION_LABEL[e.action]}, ${whenLabel(new Date(e.at), now)}`}>
                  <ActionMark action={e.action} />
                  <span className="crm-entry-main">
                    <span className="crm-entry-h">
                      <b>{CUSTOMER_ACTION_LABEL[e.action]}</b>
                      <time dateTime={e.at}>{whenLabel(new Date(e.at), now)}</time>
                    </span>
                    {e.brief && <span className="crm-entry-b">{e.brief}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {orders}

      {sheet?.kind === "edit" && (
        <CustomerFormSheet
          key={`edit-${sheetKey}`}
          open={sheetOpen}
          onClose={close}
          title="Edit customer"
          description={`#${customer.number} on ${board.name}`}
          initial={{ number: customer.number, name: customer.name, nickname: customer.nickname ?? "", phone: customer.phone ?? "" }}
          numericId={/^\d+$/.test(customer.number)}
          selfId={customer.id}
          submitLabel="Save"
          onSave={async (value) => {
            const res = await editCustomer(customer.id, value, { refresh: true });
            if (!res.ok) return res.error;
            close();
            return null;
          }}
        >
          <div className="crm-danger" style={{ marginTop: 14 }}>
            <p>Archive takes them out of the search and stops their reminders. Everything is kept; Archived on the list restores them.</p>
            <div className="crm-form-actions">
              {confirmArchive ? (
                <>
                  <Button variant="danger" onClick={archiveThisCustomer} disabled={archiving}>
                    {archiving ? "Archiving…" : `Archive ${customer.name}`}
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirmArchive(false)} disabled={archiving}>
                    Keep
                  </Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setConfirmArchive(true)}>
                  Archive…
                </Button>
              )}
            </div>
            {error && (
              <p className="crm-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </CustomerFormSheet>
      )}

      {sheet?.kind === "info" && (
        <InfoSheet
          key={`info-${sheetKey}`}
          open={sheetOpen}
          onClose={close}
          editing={sheet.info !== null}
          initial={sheet.initial}
          onSave={async (value) => {
            const i = sheet.info;
            const res = i ? await editCustomerInfo(i.id, value, { refresh: true }) : await addCustomerInfo(customer.id, value, { refresh: true });
            if (!res.ok) return res.error;
            close();
            return null;
          }}
          onArchive={
            sheet.info
              ? async () => {
                  const i = sheet.info as CustomerInfoView;
                  const res = await archiveCustomerInfo(i.id, { refresh: true });
                  if (!res.ok) return res.error;
                  close();
                  pushToast({
                    key: `crm-info-${i.id}`,
                    title: "Info archived",
                    body: infoRecordedLabel(new Date(i.recordedAt), new Date()),
                    action: { label: "Undo", onAction: () => undo(() => restoreCustomerInfo(i.id, { refresh: true })) },
                  });
                  return null;
                }
              : undefined
          }
        />
      )}

      {sheet?.kind === "entry" && (
        <InteractionSheet
          key={`entry-${sheetKey}`}
          open={sheetOpen}
          onClose={close}
          editing={sheet.entry !== null}
          initial={sheet.initial}
          onSave={async (value) => {
            const e = sheet.entry;
            const res = e ? await editInteraction(e.id, value, { refresh: true }) : await addInteraction(customer.id, value, { refresh: true });
            if (!res.ok) return res.error;
            close();
            return null;
          }}
          onArchive={
            sheet.entry
              ? async () => {
                  const e = sheet.entry as InteractionView;
                  const res = await archiveInteraction(e.id, { refresh: true });
                  if (!res.ok) return res.error;
                  close();
                  pushToast({
                    key: `crm-entry-${e.id}`,
                    title: "Entry archived",
                    body: `${CUSTOMER_ACTION_LABEL[e.action]} · ${whenLabel(new Date(e.at), new Date())}`,
                    action: { label: "Undo", onAction: () => undo(() => restoreInteraction(e.id, { refresh: true })) },
                  });
                  return null;
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
