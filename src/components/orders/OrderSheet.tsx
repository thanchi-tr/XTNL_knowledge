"use client";

/**
 * An order line's sheet (work-orders.ts holds the rules): add and edit. The
 * fields in the user's own order: who it is for (a name) and how to reach
 * them (a contact: a phone or an email becomes a tap on the list), what to
 * order (the item), the date (today by default) and the Ordered switch. On a
 * tab that keeps a customer list, a "Customer ID" field comes first: an ID
 * that matches one of the tab's customers (ignoring case) fills a blank name
 * and contact as it is typed, and links the line to them; an unknown ID is
 * said under the field, and the server refuses it too. On a customer's own
 * page the customer is fixed (shown, not typed) and the item takes focus.
 *
 * Each field is checked with the same clean* the server uses; the sheet
 * hands a clean input to its caller's save, which answers an error line or
 * null. Edit adds Archive (the caller offers Undo). A parent remounts the
 * sheet (its `key`) each time it opens, so the fields start from `initial`.
 */
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  ORDER_CONTACT_MAX,
  ORDER_CUSTOMER_MAX,
  ORDER_ITEM_MAX,
  ORDER_NAME_MAX,
  cleanOrderContact,
  cleanOrderCustomer,
  cleanOrderDate,
  cleanOrderItem,
  cleanOrderName,
  contactLinkOf,
  matchOrderCustomer,
  orderCustomerUnknown,
  type OrderCustomerRef,
  type WorkOrderInput,
} from "@/lib/work-orders";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";

export const ORDER_UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

const count = (s: string) => [...s].length;

export interface OrderFormValue {
  item: string;
  name: string;
  contact: string;
  /** 'YYYY-MM-DD', or "" for no date. */
  date: string;
  ordered: boolean;
  /** The customer ID as typed ("" for none). */
  customer: string;
}

type FieldKey = "item" | "name" | "contact" | "date" | "customer" | "form";

function Field({ id, label, aside, error, children }: { id: string; label: string; aside?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <div className="crm-field">
      <label className="crm-field-l" htmlFor={id}>
        {label}
        {aside != null && <span className="t-meta">{aside}</span>}
      </label>
      {children}
      {error && (
        <p className="crm-field-err" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

const invalid = (error: string | null | undefined, id: string) => (error ? { "aria-invalid": true as const, "aria-describedby": `${id}-err` } : {});

/** What a contact will be on the list: a call, an email, or words. */
function contactNote(contact: string): string {
  const c = contact.trim();
  if (!c) return "optional";
  const kind = contactLinkOf(c).kind;
  return kind === "tel" ? "tap to call" : kind === "mail" ? "tap to email" : "shown as typed";
}

export function OrderSheet({
  open,
  onClose,
  editing,
  description,
  initial,
  customerField,
  customers,
  linked,
  fixedCustomer,
  onSave,
  onArchive,
}: {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  description?: string;
  initial: OrderFormValue;
  /** Show the Customer ID field (the tab keeps a customer list, or the line is linked to a customer). */
  customerField: boolean;
  /** The tab's open customers, matched as an ID is typed. */
  customers: readonly OrderCustomerRef[];
  /** Edit: the customer the line is linked to now (kept while the ID is left as it is, even if archived since). */
  linked?: { number: string } | null;
  /** A customer page: the line is for this customer (shown, not typed). */
  fixedCustomer?: OrderCustomerRef | null;
  onSave: (value: WorkOrderInput) => Promise<string | null>;
  /** Edit only: archive the line (the caller offers Undo). */
  onArchive?: () => Promise<string | null>;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [pending, start] = useTransition();
  const clear = (k: FieldKey) => (errors[k] || errors.form) && setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  const set = (k: Exclude<keyof OrderFormValue, "ordered">) => (value: string) => {
    setV((x) => ({ ...x, [k]: value }));
    clear(k);
  };

  const sameAsLinked = (typed: string) => Boolean(linked && typed.trim() && linked.number.trim().toLowerCase() === typed.trim().toLowerCase());
  const matched = fixedCustomer ?? matchOrderCustomer(customers, v.customer);
  const typedCustomer = v.customer.trim();
  /** The first field takes focus: the customer ID, else the name; with the customer fixed (or on an edit), the item. */
  const focus = editing || fixedCustomer ? "item" : customerField ? "customer" : "name";

  /** A typed ID that matches a customer fills a blank name and contact (or ones the last match filled). */
  function onCustomer(value: string) {
    setV((x) => {
      const was = matchOrderCustomer(customers, x.customer);
      const now = matchOrderCustomer(customers, value);
      let { name, contact } = x;
      if (now) {
        if (!name.trim() || (was && name === was.name)) name = now.name;
        if (!contact.trim() || (was && contact === (was.phone ?? ""))) contact = now.phone ?? "";
      }
      return { ...x, customer: value, name, contact };
    });
    clear("customer");
  }

  function save() {
    const item = cleanOrderItem(v.item);
    // A blank name with a newly matched customer is theirs (the server fills it the same way).
    const name = cleanOrderName(!v.name.trim() && matched ? matched.name : v.name);
    const contact = cleanOrderContact(v.contact);
    const date = cleanOrderDate(v.date);
    const customer = fixedCustomer ? ({ ok: true, value: fixedCustomer.number } as const) : cleanOrderCustomer(v.customer);
    const next: Partial<Record<FieldKey, string>> = {};
    if (!item.ok) next.item = item.error;
    if (!name.ok) next.name = name.error;
    if (!contact.ok) next.contact = contact.error;
    if (!date.ok) next.date = date.error;
    if (!customer.ok) next.customer = customer.error;
    else if (customerField && !fixedCustomer && customer.value && !matched && !sameAsLinked(customer.value)) next.customer = orderCustomerUnknown(customer.value);
    if (!item.ok || !name.ok || !contact.ok || !date.ok || !customer.ok || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    const value: WorkOrderInput = { item: item.value, name: name.value, contact: contact.value ?? "", date: date.value ?? "", ordered: v.ordered };
    if (customerField || fixedCustomer) value.customer = customer.value ?? "";
    start(async () => {
      let error: string | null;
      try {
        error = await onSave(value);
      } catch {
        error = ORDER_UNREACHABLE;
      }
      if (error) setErrors({ form: error });
    });
  }

  function archive() {
    if (!onArchive) return;
    start(async () => {
      let error: string | null;
      try {
        error = await onArchive();
      } catch {
        error = ORDER_UNREACHABLE;
      }
      if (error) setErrors({ form: error });
    });
  }

  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={editing ? "Edit order" : "Add order"} description={description}>
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {fixedCustomer ? (
          <div className="crm-field">
            <span className="crm-field-l">Customer</span>
            <span className="ord-fixed">
              <span className="ord-num">#{fixedCustomer.number}</span>
              {fixedCustomer.name}
            </span>
          </div>
        ) : (
          customerField && (
            <Field id={`${id}-cust`} label="Customer ID" aside="optional" error={errors.customer}>
              <input
                id={`${id}-cust`}
                className="crm-input"
                value={v.customer}
                onChange={(e) => onCustomer(e.target.value)}
                inputMode={customers.length > 0 && customers.every((c) => /^\d+$/.test(c.number.trim())) ? "numeric" : "text"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={ORDER_CUSTOMER_MAX + 8}
                data-autofocus={focus === "customer" ? "" : undefined}
                {...(errors.customer ? invalid(errors.customer, `${id}-cust`) : { "aria-describedby": `${id}-cust-hint` })}
              />
              {!errors.customer && (
                <p id={`${id}-cust-hint`} className="ord-hint" data-match={matched ? "" : undefined} aria-live="polite">
                  {!typedCustomer
                    ? "A customer of this tab, by their ID: fills the name and contact."
                    : matched
                      ? `${matched.name}${matched.phone ? ` · ${matched.phone}` : ""}`
                      : sameAsLinked(typedCustomer)
                        ? "Linked as before."
                        : "No customer with that ID on this tab."}
                </p>
              )}
            </Field>
          )
        )}
        <Field id={`${id}-name`} label="Name" error={errors.name}>
          <input
            id={`${id}-name`}
            className="crm-input"
            value={v.name}
            onChange={(e) => set("name")(e.target.value)}
            autoComplete="off"
            maxLength={ORDER_NAME_MAX + 8}
            data-autofocus={focus === "name" ? "" : undefined}
            {...invalid(errors.name, `${id}-name`)}
          />
        </Field>
        <Field id={`${id}-contact`} label="Contact" aside={contactNote(v.contact)} error={errors.contact}>
          <input
            id={`${id}-contact`}
            className="crm-input"
            value={v.contact}
            onChange={(e) => set("contact")(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Phone or email"
            maxLength={ORDER_CONTACT_MAX + 8}
            {...invalid(errors.contact, `${id}-contact`)}
          />
        </Field>
        <Field id={`${id}-item`} label="Item" aside={`${count(v.item.trim())}/${ORDER_ITEM_MAX}`} error={errors.item}>
          <input
            id={`${id}-item`}
            className="crm-input"
            value={v.item}
            onChange={(e) => set("item")(e.target.value)}
            autoComplete="off"
            maxLength={ORDER_ITEM_MAX + 8}
            data-autofocus={focus === "item" ? "" : undefined}
            {...invalid(errors.item, `${id}-item`)}
          />
        </Field>
        <Field id={`${id}-date`} label="Date" aside={v.date ? undefined : "none"} error={errors.date}>
          <input id={`${id}-date`} className="crm-input" type="date" value={v.date} min="2000-01-01" max="2099-12-31" onChange={(e) => set("date")(e.target.value)} {...invalid(errors.date, `${id}-date`)} />
        </Field>
        <div className="crm-switch-row">
          <span>
            Ordered
            <span className="t-meta">{v.ordered ? "Done: it has been ordered." : "Not yet: it stays under To order."}</span>
          </span>
          <Switch checked={v.ordered} onChange={(ordered) => setV((x) => ({ ...x, ordered }))} label="Ordered" />
        </div>
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add order"}
          </Button>
          <Button type="button" variant="quiet" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
        </div>
        {errors.form && (
          <p className="crm-error" role="alert">
            {errors.form}
          </p>
        )}
      </form>
      {editing && onArchive && (
        <div className="crm-danger" style={{ marginTop: 14 }}>
          <p>Archive takes the line off the list. You can undo right after.</p>
          <div className="crm-form-actions">
            <Button variant="secondary" onClick={archive} disabled={pending}>
              Archive order
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
