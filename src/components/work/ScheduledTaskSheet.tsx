"use client";

/**
 * Add or edit a scheduled task (scheduled-tasks.ts holds every rule the server holds too). The ONE sheet lives in the
 * work frame's header (ScheduledSheetHost) and opens from anywhere under it (work-store openScheduledSheet): the New
 * menu, an agenda row, a customer's page.
 *
 *   Task        the title (1..200)
 *   When        a date and a time on the user's clock (LIFE_TZ), or All day (the day only; its reminder at 09:00)
 *   How         Call · Visit · Email · Message · Other (the app's own glyphs, each with its word)
 *   Customer    only on a tab whose customer list is on (or a task that already has one): the same live matcher as
 *               the header (customer-search.ts) over the frame's index, "Jane Nguyen · C-1042"
 *   Collection  once a customer is chosen (Phase 2, crm.ts): their open task collections (the frame's index), or
 *               "New collection…" made right here (a name, optionally one of their orders); another customer clears it
 *   Detail      optional (≤ 500)
 *   Reminder    on by default: the bell, the in-app banner and a push to each device turned on in Settings ›
 *               Notifications. Moving the time arms it again (remindSentAt cleared on the server)
 *
 * An edit's footer also marks it done (with "Log to history" for a customer's task: an action, prefilled from the
 * channel, and a brief, prefilled from the title, written to their log in the same transaction), opens a done one
 * again, and archives (with Undo in the dock).
 */
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { archiveScheduledTask, createScheduledTask, doneScheduledTask, editScheduledTask, reopenScheduledTask, restoreScheduledTask } from "@/app/actions/scheduled-tasks";
import { createTaskCollection, customerOrderOptions } from "@/app/actions/crm";
import { COLLECTION_NAME_MAX, cleanCollectionInput, type CollectionOrderRef } from "@/lib/crm";
import {
  CHANNELS,
  CHANNEL_WORDS,
  SCHEDULED_DETAIL_MAX,
  SCHEDULED_TITLE_MAX,
  cleanScheduledInput,
  logActionOf,
  whenLineOf,
  type Channel,
  type ScheduledTaskInput,
} from "@/lib/scheduled-tasks";
import { CUSTOMER_ACTIONS, CUSTOMER_ACTION_LABEL, INTERACTION_BRIEF_MAX, cleanAction, cleanBrief, type CustomerAction } from "@/lib/customers";
import { customerLabelOf, matchCustomers, prepareIndex, type WorkIndex } from "@/lib/customer-search";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { pushToast } from "@/components/ui/toast-store";
import { ActionMark, ChannelGlyph } from "./ChannelGlyph";
import { CustomerResult } from "./WorkSearch";
import { closeScheduledSheet, useScheduledSheet, type SheetRequest, type WorkFrameBoard } from "./work-store";

export const SCHEDULED_UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";
const PICKER_CAP = 6;
const count = (s: string) => [...s].length;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: SCHEDULED_UNREACHABLE };
  }
}

/** The sheet, mounted once by the work header: it follows the work store's requests. */
export function ScheduledSheetHost({ board, index }: { board: WorkFrameBoard; index: WorkIndex | null }) {
  const req = useScheduledSheet();
  if (!req) return null;
  return <ScheduledTaskSheet key={req.key} req={req} board={board} index={index} />;
}

/** The Collection picker's "New collection…" choice. */
const NEW_COLLECTION = "__new";

/** The customer a task starts with, as the picker shows it. */
function customerOf(req: SheetRequest, index: WorkIndex | null): { id: string; number: string; name: string } | null {
  if (req.task?.customer) return req.task.customer;
  if (req.customer) return req.customer;
  if (!req.customerId) return null;
  const c = index?.customers.find((x) => x.id === req.customerId);
  return c ? { id: c.id, number: c.number, name: c.name } : null;
}

function ScheduledTaskSheet({ req, board, index }: { req: SheetRequest; board: WorkFrameBoard; index: WorkIndex | null }) {
  const ids = useId();
  const edit = req.task;
  const [title, setTitle] = useState(edit?.title ?? req.title ?? "");
  const [day, setDay] = useState(req.when.slice(0, 10));
  const [time, setTime] = useState(edit?.allDay ? "09:00" : req.when.slice(11, 16));
  const [allDay, setAllDay] = useState(edit?.allDay ?? false);
  const [channel, setChannel] = useState<Channel>(edit?.channel ?? req.channel ?? "CALL");
  const [customer, setCustomerState] = useState(() => customerOf(req, index));
  // The task's collection (one of its customer's), and the ones made in this sheet (not in the index until it reloads).
  const startCollection = edit?.collection ?? req.collection ?? null;
  const startCustomerId = customerOf(req, index)?.id ?? null;
  const [collectionId, setCollectionId] = useState<string | null>(startCollection?.id ?? null);
  const [made, setMade] = useState<{ id: string; customerId: string; name: string }[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOrder, setNewOrder] = useState("");
  const [orders, setOrders] = useState<CollectionOrderRef[] | null>(null);
  const [newError, setNewError] = useState<string | null>(null);
  const [picking, setPicking] = useState("");
  const [detail, setDetail] = useState(edit?.detail ?? "");
  const [remind, setRemind] = useState(edit?.remind ?? true);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logOn, setLogOn] = useState(true);
  const [logAction, setLogAction] = useState<CustomerAction | null>(logActionOf(edit?.channel ?? "OTHER"));
  const [logBrief, setLogBrief] = useState(edit?.title ?? "");
  const [pending, start] = useTransition();

  const showCustomer = board.crmOn || Boolean(edit?.customer);
  const prepared = useMemo(() => (index ? prepareIndex(index.customers) : null), [index]);
  const picks = prepared && picking.trim() ? matchCustomers(prepared, picking, { limit: PICKER_CAP }) : null;
  const done = Boolean(edit?.doneAt);

  /** Another customer (or none) takes the task out of its collection. */
  function setCustomer(next: { id: string; number: string; name: string } | null) {
    if (next?.id !== customer?.id) {
      setCollectionId(null);
      setNewOpen(false);
      setOrders(null);
    }
    setCustomerState(next);
  }

  // The chosen customer's open collections: the frame's index, the ones made here, and the task's own (closed, say).
  const indexed = customer ? (index?.collections ?? []).filter((c) => c.customerId === customer.id) : [];
  const collections = customer
    ? [
        ...indexed,
        ...made.filter((c) => c.customerId === customer.id && !indexed.some((x) => x.id === c.id)),
        ...(startCollection && customer.id === startCustomerId && !indexed.some((x) => x.id === startCollection.id) ? [{ id: startCollection.id, customerId: customer.id, name: startCollection.name }] : []),
      ]
    : [];

  function pickCollection(value: string) {
    setNewError(null);
    if (value !== NEW_COLLECTION) {
      setNewOpen(false);
      setCollectionId(value || null);
      return;
    }
    setNewOpen(true);
    setNewName("");
    setNewOrder("");
    if (board.ordersOn && customer && orders === null) {
      const forId = customer.id;
      void call(() => customerOrderOptions(forId)).then((res) => setOrders(res.ok ? res.value : []));
    }
  }

  function addCollection() {
    if (!customer) return;
    const value = { name: newName, orderId: newOrder || null };
    const local = cleanCollectionInput(value);
    if (!local.ok) {
      setNewError(local.error);
      return;
    }
    const forCustomer = customer.id;
    setNewError(null);
    start(async () => {
      const res = await call(() => createTaskCollection(forCustomer, value));
      if (!res.ok) {
        setNewError(res.error);
        return;
      }
      setMade((m) => [...m, { id: res.value.id, customerId: forCustomer, name: res.value.name }]);
      setCollectionId(res.value.id);
      setNewOpen(false);
    });
  }

  function input(): ScheduledTaskInput {
    return { title, detail, when: allDay ? day : `${day}T${time}`, allDay, channel, remind, customerId: customer?.id ?? null, collectionId: customer ? collectionId : null };
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const value = input();
    const local = cleanScheduledInput(value);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    // A collection named but not yet added is made first, and the task goes into it (Schedule never drops the name).
    const pendingCollection = newOpen && customer && newName.trim() ? { name: newName, orderId: newOrder || null } : null;
    if (pendingCollection) {
      const checked = cleanCollectionInput(pendingCollection);
      if (!checked.ok) {
        setNewError(checked.error);
        return;
      }
    }
    setError(null);
    start(async () => {
      if (pendingCollection && customer) {
        const forCustomer = customer.id;
        const made = await call(() => createTaskCollection(forCustomer, pendingCollection));
        if (!made.ok) {
          setNewError(made.error);
          return;
        }
        setMade((m) => [...m, { id: made.value.id, customerId: forCustomer, name: made.value.name }]);
        setCollectionId(made.value.id);
        setNewOpen(false);
        value.collectionId = made.value.id;
      }
      const res = await call(() => (edit ? editScheduledTask(edit.id, value, { refresh: true }) : createScheduledTask(board.id, value, { refresh: true })));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeScheduledSheet();
      if (!edit) pushToast({ key: `st-new-${res.value.id}`, title: "Scheduled", body: `${res.value.title} · ${whenLineOf(res.value, new Date())}` });
    });
  }

  function markDone(withLog: boolean) {
    if (!edit) return;
    let log: { action: string; brief: string } | null = null;
    if (withLog) {
      const action = cleanAction(logAction);
      const brief = cleanBrief(logBrief);
      if (!action.ok || !brief.ok) {
        setError(!action.ok ? action.error : brief.ok ? null : brief.error);
        return;
      }
      log = { action: action.value, brief: brief.value };
    }
    setError(null);
    start(async () => {
      const res = await call(() => doneScheduledTask(edit.id, log, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeScheduledSheet();
      const interactionId = res.value.interactionId;
      pushToast({
        key: `st-done-${edit.id}`,
        title: log ? "Done and logged" : "Done",
        body: edit.title,
        holdMs: 10_000,
        action: { label: "Undo", onAction: () => void call(() => reopenScheduledTask(edit.id, interactionId, { refresh: true })) },
      });
    });
  }

  function reopen() {
    if (!edit) return;
    start(async () => {
      const res = await call(() => reopenScheduledTask(edit.id, null, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeScheduledSheet();
    });
  }

  function archive() {
    if (!edit) return;
    start(async () => {
      const res = await call(() => archiveScheduledTask(edit.id, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeScheduledSheet();
      pushToast({
        key: `st-arch-${edit.id}`,
        title: "Scheduled task archived",
        body: edit.title,
        holdMs: 10_000,
        action: { label: "Undo", onAction: () => void call(() => restoreScheduledTask(edit.id, { refresh: true })) },
      });
    });
  }

  const titleId = `${ids}-title`;
  return (
    <Sheet
      open={req.open}
      onClose={() => {
        if (!pending) closeScheduledSheet();
      }}
      title={edit ? "Edit scheduled task" : "New scheduled task"}
      description={edit ? `On ${board.name}${done ? " · done" : ""}` : `On ${board.name}. When, what, how, and for whom.`}
      footer={
        <div className="st-foot">
          <Button variant="primary" size="lg" type="submit" form={`${ids}-form`} disabled={pending}>
            {pending ? "Saving…" : edit ? "Save" : "Schedule"}
          </Button>
          {edit && !done && (
            <Button variant="secondary" onClick={() => (edit.customer ? setLogOpen((o) => !o) : markDone(false))} disabled={pending} aria-expanded={edit.customer ? logOpen : undefined}>
              Mark done
            </Button>
          )}
          {edit && done && (
            <Button variant="secondary" onClick={reopen} disabled={pending}>
              Open again
            </Button>
          )}
          {edit && (
            <Button variant="quiet" onClick={archive} disabled={pending}>
              Archive
            </Button>
          )}
        </div>
      }
    >
      <form id={`${ids}-form`} className="st-form" onSubmit={save} noValidate>
        {edit && !done && edit.customer && logOpen && (
          <fieldset className="st-log">
            <legend className="st-label">Mark done</legend>
            <div className="st-switch-row">
              <span>
                Log to history
                <span className="t-meta">An entry in {customerLabelOf(edit.customer)}&apos;s log, now.</span>
              </span>
              <Switch checked={logOn} onChange={setLogOn} label="Log to history" />
            </div>
            {logOn && (
              <>
                <div className="crm-chips" role="radiogroup" aria-label="What happened">
                  {CUSTOMER_ACTIONS.map((a) => (
                    <label key={a} className="crm-chip">
                      <input type="radio" name={`${ids}-act`} value={a} checked={logAction === a} onChange={() => setLogAction(a)} />
                      <ActionMark action={a} />
                      {CUSTOMER_ACTION_LABEL[a]}
                    </label>
                  ))}
                </div>
                <label className="st-label" htmlFor={`${ids}-brief`}>
                  Brief <span className="t-meta">{count(logBrief.trim())}/{INTERACTION_BRIEF_MAX}</span>
                </label>
                <textarea id={`${ids}-brief`} className="st-input" rows={2} value={logBrief} onChange={(e) => setLogBrief(e.target.value)} maxLength={INTERACTION_BRIEF_MAX + 20} />
              </>
            )}
            <div className="st-foot">
              <Button variant="primary" onClick={() => markDone(logOn)} disabled={pending}>
                {logOn ? "Done and log" : "Done"}
              </Button>
            </div>
          </fieldset>
        )}

        <div className="st-field">
          <label className="st-label" htmlFor={titleId}>
            Task <span className="t-meta">{count(title.trim())}/{SCHEDULED_TITLE_MAX}</span>
          </label>
          <input id={titleId} className="st-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={SCHEDULED_TITLE_MAX + 8} autoComplete="off" placeholder="Ring Jane about the quote" data-autofocus />
        </div>

        <fieldset className="st-field">
          <legend className="st-label">When</legend>
          <div className="st-when">
            <input className="st-input" type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
            {!allDay && <input className="st-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />}
          </div>
          <div className="st-switch-row">
            <span>
              All day
              <span className="t-meta">{allDay ? "The day only; its reminder at 09:00." : "At a time."}</span>
            </span>
            <Switch checked={allDay} onChange={setAllDay} label="All day" />
          </div>
        </fieldset>

        <fieldset className="st-field">
          <legend className="st-label">How</legend>
          <div className="st-channels" role="radiogroup" aria-label="How">
            {CHANNELS.map((c) => (
              <label key={c} className="st-chan">
                <input type="radio" name={`${ids}-chan`} value={c} checked={channel === c} onChange={() => setChannel(c)} />
                <ChannelGlyph channel={c} />
                {CHANNEL_WORDS[c]}
              </label>
            ))}
          </div>
        </fieldset>

        {showCustomer && (
          <div className="st-field">
            <label className="st-label" htmlFor={`${ids}-cust`}>
              Customer <span className="t-meta">optional</span>
            </label>
            {customer ? (
              <div className="st-picked">
                <span className="st-picked-l">{customerLabelOf(customer)}</span>
                <button type="button" className="st-x" onClick={() => setCustomer(null)} aria-label={`Remove the customer ${customerLabelOf(customer)}`}>
                  <Icon name="x" />
                </button>
              </div>
            ) : index ? (
              <>
                <input
                  id={`${ids}-cust`}
                  className="st-input"
                  type="search"
                  value={picking}
                  onChange={(e) => setPicking(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter takes the top match (as the header search does), never submits the sheet; ↓ moves into the list.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const top = picks?.results[0];
                      if (top) {
                        setCustomer({ id: top.entry.id, number: top.entry.number, name: top.entry.name });
                        setPicking("");
                      }
                    } else if (e.key === "ArrowDown") {
                      const first = e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(".st-pick");
                      if (first) {
                        e.preventDefault();
                        first.focus();
                      }
                    }
                  }}
                  placeholder="Customer ID, name or phone"
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={`${ids}-cust-n`}
                />
                <p id={`${ids}-cust-n`} className="st-hint" aria-live="polite">
                  {!picking.trim() ? "Type to find a customer of this tab." : picks && picks.total > 0 ? `${picks.total} found.` : "No customer matches."}
                </p>
                {picks && picks.results.length > 0 && (
                  <ul className="st-picks" aria-label="Matching customers">
                    {picks.results.map((m) => (
                      <li key={m.entry.id}>
                        <button
                          type="button"
                          className="st-pick"
                          onClick={() => {
                            setCustomer({ id: m.entry.id, number: m.entry.number, name: m.entry.name });
                            setPicking("");
                          }}
                        >
                          <CustomerResult m={m} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="st-hint">The customer list couldn&apos;t load. Save without one, or try again.</p>
            )}
          </div>
        )}

        {showCustomer && customer && (
          <div className="st-field">
            <label className="st-label" htmlFor={`${ids}-coll`}>
              Collection <span className="t-meta">optional</span>
            </label>
            <select id={`${ids}-coll`} className="st-input st-select" value={newOpen ? NEW_COLLECTION : (collectionId ?? "")} onChange={(e) => pickCollection(e.target.value)} disabled={pending}>
              <option value="">No collection</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value={NEW_COLLECTION}>New collection…</option>
            </select>
            {!newOpen && <p className="st-hint">Groups {customer.name}&apos;s tasks for one job: a new service, an order.</p>}
            {newOpen && (
              <fieldset className="st-newcoll">
                <legend className="st-label">New collection for {customer.name}</legend>
                <label className="st-label" htmlFor={`${ids}-coll-name`}>
                  Name <span className="t-meta">{count(newName.trim())}/{COLLECTION_NAME_MAX}</span>
                </label>
                <input
                  id={`${ids}-coll-name`}
                  className="st-input"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNewError(null);
                  }}
                  onKeyDown={(e) => {
                    // Enter adds the collection, never submits the sheet.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCollection();
                    }
                  }}
                  maxLength={COLLECTION_NAME_MAX + 8}
                  autoComplete="off"
                  placeholder="New NBN service"
                />
                {board.ordersOn && (
                  <>
                    <label className="st-label" htmlFor={`${ids}-coll-order`}>
                      For an order <span className="t-meta">optional</span>
                    </label>
                    <select id={`${ids}-coll-order`} className="st-input st-select" value={newOrder} onChange={(e) => setNewOrder(e.target.value)} disabled={orders === null}>
                      <option value="">{orders === null ? "Loading their orders…" : orders.length === 0 ? "No orders for them" : "No order"}</option>
                      {(orders ?? []).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.item}
                          {o.ordered ? " (ordered)" : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {newError && (
                  <p className="st-err" role="alert">
                    {newError}
                  </p>
                )}
                <div className="st-foot">
                  <Button variant="secondary" onClick={addCollection} disabled={pending}>
                    Add collection
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setNewOpen(false);
                      setNewError(null);
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              </fieldset>
            )}
          </div>
        )}

        <div className="st-field">
          <label className="st-label" htmlFor={`${ids}-detail`}>
            Detail <span className="t-meta">{count(detail.trim())}/{SCHEDULED_DETAIL_MAX}</span>
          </label>
          <textarea id={`${ids}-detail`} className="st-input" rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={SCHEDULED_DETAIL_MAX + 20} />
        </div>

        <div className="st-switch-row">
          <span>
            Reminder
            <span className="t-meta">
              {remind ? (
                <>
                  At its time: the bell, a banner while the app is open, and a notification on each device turned on in <Link href="/settings#notifications">Settings › Notifications</Link>.
                </>
              ) : (
                "Off: it stays on the agenda, with no reminder."
              )}
            </span>
          </span>
          <Switch checked={remind} onChange={setRemind} label="Reminder" />
        </div>
        {edit?.remindSentAt && remind && <p className="st-hint">Its reminder was sent. Move the time to be reminded again.</p>}

        {error && (
          <p className="st-err" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
