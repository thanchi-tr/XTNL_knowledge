"use client";

/**
 * A task collection's sheet (Phase 2, crm.ts): start one for a customer (a name, optionally one of their orders on the
 * tab, a note) or edit one, close it once its work is done (or open it again), and archive it (with Undo in the dock:
 * its tasks stay, shown under "No collection"). It calls the actions itself, so a customer's Tasks tab and their order
 * ("Start a collection", prefilled with the order's item) open the same sheet. A parent remounts it (its `key`) each
 * time it opens, so the fields start from `initial`.
 */
import { useEffect, useId, useState, useTransition } from "react";
import { archiveTaskCollection, closeTaskCollection, createTaskCollection, customerOrderOptions, editTaskCollection, restoreTaskCollection } from "@/app/actions/crm";
import { COLLECTION_NAME_MAX, COLLECTION_NOTE_MAX, cleanCollectionInput, type CollectionOrderRef, type CollectionView } from "@/lib/crm";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { UNREACHABLE } from "./CustomerSheets";

const count = (s: string) => [...s].length;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
async function call<T>(fn: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await fn();
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

export interface CollectionFormValue {
  name: string;
  note: string;
  /** "" for none. */
  orderId: string;
}

export function CollectionSheet({
  open,
  onClose,
  customer,
  editing,
  initial,
  ordersOn,
  orders: given = null,
}: {
  open: boolean;
  onClose: () => void;
  customer: { id: string; name: string };
  /** The collection being edited, or null for a new one. */
  editing: CollectionView | null;
  initial: CollectionFormValue;
  /** The tab keeps an order list: the sheet offers one of the customer's orders. */
  ordersOn: boolean;
  /** The customer's orders when the page has them; null: read when the sheet opens. */
  orders?: CollectionOrderRef[] | null;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<CollectionOrderRef[] | null>(given);
  const [pending, start] = useTransition();

  // The customer's orders, read once when the page did not hand them over.
  useEffect(() => {
    if (!ordersOn || orders !== null) return;
    let live = true;
    void call(() => customerOrderOptions(customer.id)).then((res) => {
      if (live) setOrders(res.ok ? res.value : []);
    });
    return () => {
      live = false;
    };
  }, [ordersOn, orders, customer.id]);

  const set = (k: keyof CollectionFormValue) => (value: string) => {
    setV((x) => ({ ...x, [k]: value }));
    if (error) setError(null);
  };

  function save() {
    const value = { name: v.name, note: v.note, orderId: v.orderId || null };
    const local = cleanCollectionInput(value);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    start(async () => {
      const res = editing ? await call(() => editTaskCollection(editing.id, value, { refresh: true })) : await call(() => createTaskCollection(customer.id, value, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      if (!editing) pushToast({ key: `coll-new-${customer.id}`, title: "Collection started", body: `${local.value.name} · ${customer.name}` });
    });
  }

  function setClosed(closed: boolean) {
    if (!editing) return;
    start(async () => {
      const res = await call(() => closeTaskCollection(editing.id, closed, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      pushToast({
        key: `coll-close-${editing.id}`,
        title: closed ? "Collection closed" : "Collection open again",
        body: editing.name,
        action: closed ? { label: "Undo", onAction: () => void call(() => closeTaskCollection(editing.id, false, { refresh: true })) } : undefined,
      });
    });
  }

  function archive() {
    if (!editing) return;
    start(async () => {
      const res = await call(() => archiveTaskCollection(editing.id, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onClose();
      pushToast({
        key: `coll-arch-${editing.id}`,
        title: "Collection archived",
        body: `${editing.name}: its tasks stay, under No collection.`,
        holdMs: 10_000,
        action: { label: "Undo", onAction: () => void call(() => restoreTaskCollection(editing.id, { refresh: true })) },
      });
    });
  }

  // An order linked before the list was read (or archived since) still shows as the choice it is.
  const options = orders ?? [];
  const missing = v.orderId && !options.some((o) => o.id === v.orderId) ? (editing?.order?.id === v.orderId ? editing.order : null) : null;
  return (
    <Sheet
      open={open}
      onClose={() => !pending && onClose()}
      title={editing ? "Edit collection" : "New collection"}
      description={editing ? `${customer.name}${editing.closedAt ? " · closed" : ""}` : `For ${customer.name}: the tasks of one job, a new service, an order.`}
    >
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="crm-field">
          <label className="crm-field-l" htmlFor={`${id}-name`}>
            Name
            <span className="t-meta">
              {count(v.name.trim())}/{COLLECTION_NAME_MAX}
            </span>
          </label>
          <input id={`${id}-name`} className="crm-input" value={v.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" maxLength={COLLECTION_NAME_MAX + 8} placeholder="New NBN service" data-autofocus />
        </div>
        {ordersOn && (
          <div className="crm-field">
            <label className="crm-field-l" htmlFor={`${id}-order`}>
              For an order
              <span className="t-meta">optional</span>
            </label>
            <select id={`${id}-order`} className="crm-input crm-select" value={v.orderId} onChange={(e) => set("orderId")(e.target.value)} disabled={orders === null}>
              <option value="">{orders === null ? "Loading their orders…" : options.length === 0 && !missing ? `No orders for ${customer.name}` : "No order"}</option>
              {missing && <option value={missing.id}>{missing.item}</option>}
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.item}
                  {o.ordered ? " (ordered)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="crm-field">
          <label className="crm-field-l" htmlFor={`${id}-note`}>
            Note
            <span className="t-meta">
              {count(v.note.trim())}/{COLLECTION_NOTE_MAX}
            </span>
          </label>
          <textarea id={`${id}-note`} className="crm-input crm-input-short" rows={2} value={v.note} onChange={(e) => set("note")(e.target.value)} maxLength={COLLECTION_NOTE_MAX + 20} />
        </div>
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Start collection"}
          </Button>
          <Button type="button" variant="quiet" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
        {error && (
          <p className="crm-error" role="alert">
            {error}
          </p>
        )}
      </form>
      {editing && (
        <div className="crm-danger" style={{ marginTop: 14 }}>
          <p>{editing.closedAt ? "Closed: no new tasks join it. Open it again to add more." : "Close it once its work is done; its tasks are kept. Archive takes it off their page (you can undo right after)."}</p>
          <div className="crm-form-actions">
            <Button variant="secondary" onClick={() => setClosed(!editing.closedAt)} disabled={pending}>
              {editing.closedAt ? "Open again" : "Close collection"}
            </Button>
            <Button variant="quiet" onClick={archive} disabled={pending}>
              Archive
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
