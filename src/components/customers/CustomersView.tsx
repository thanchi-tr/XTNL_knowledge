"use client";

/**
 * A work tab's customer list (/today/work/<id>/customers; customers.ts). The
 * search is by ID: the customer whose ID is exactly what was typed comes
 * first (Enter opens them), then the IDs that start with it, then name and
 * nickname matches under their own heading. While every ID on the tab is a
 * number the field opens the numeric keyboard (a small ABC / 123 key swaps
 * it, for a name). With nothing typed: the customers with tasks due today
 * (overdue first), then everyone by ID; a row's quiet last line is the first
 * line of their newest info. "Add customer" opens the details
 * sheet with the next ID suggested. Archived customers are out of the search,
 * folded at the bottom, each with Restore.
 */
import { useDeferredValue, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createCustomer, restoreCustomer } from "@/app/actions/customers";
import { customerHref, dueChipText, searchCustomers, searchPick, type ArchivedCustomerItem, type CrmBoardView, type CustomerListItem } from "@/lib/customers";
import { workBoardHref } from "@/lib/work-boards";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { CustomerFormSheet, UNREACHABLE } from "./CustomerSheets";

/** With nothing typed, at most this many customers are listed (the search finds the rest). */
export const LIST_MAX = 50;

function CustomerRow({ boardId, c, exact }: { boardId: string; c: CustomerListItem; exact?: boolean }) {
  const chip = dueChipText(c);
  return (
    <Link className="crm-row" href={customerHref(boardId, c.id)} data-exact={exact ? "" : undefined}>
      <span className="crm-num">#{c.number}</span>
      <span className="crm-row-main">
        <b>{c.name}</b>
        {(c.nickname || chip) && (
          <span className="crm-row-sub">
            {c.nickname && <span className="t-meta">“{c.nickname}”</span>}
            {chip && <span className={cx("chip", c.overdue > 0 && "owed")}>{chip}</span>}
          </span>
        )}
        {c.info && <span className="crm-row-info">{c.info}</span>}
      </span>
      <Icon name="chev" />
    </Link>
  );
}

function Group({ title, aside, boardId, list, exact }: { title: string; aside?: string; boardId: string; list: CustomerListItem[]; exact?: boolean }) {
  if (list.length === 0) return null;
  return (
    <section className="card crm-group" aria-label={title}>
      <h2 className="crm-group-h">
        {title}
        {aside && <span className="aside">{aside}</span>}
      </h2>
      <ul className="crm-list">
        {list.map((c) => (
          <li key={c.id}>
            <CustomerRow boardId={boardId} c={c} exact={exact} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CustomersView({
  board,
  customers,
  archived,
  numeric,
  suggestion,
}: {
  board: CrmBoardView;
  customers: CustomerListItem[];
  archived: ArchivedCustomerItem[];
  /** Every ID on the tab is a number. */
  numeric: boolean;
  /** The next ID, while they are. */
  suggestion: string | null;
}) {
  const id = useId();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [letters, setLetters] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [addInitial, setAddInitial] = useState({ number: "", name: "" });
  const [restoring, setRestoring] = useState<string | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [, start] = useTransition();
  const deferred = useDeferredValue(query);
  const search = searchCustomers(customers, deferred);
  const numericKeys = numeric && !letters;

  function openAdd(number: string, name = "") {
    setAddInitial({ number, name });
    setAddKey((k) => k + 1);
    setAddOpen(true);
  }

  function openBest() {
    const pick = searchPick(searchCustomers(customers, query));
    if (pick) router.push(customerHref(board.id, pick.id));
  }

  function restore(c: ArchivedCustomerItem) {
    setRestoring(c.id);
    setArchError(null);
    start(async () => {
      let res: Awaited<ReturnType<typeof restoreCustomer>>;
      try {
        res = await restoreCustomer(c.id, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      setRestoring(null);
      if (!res.ok) setArchError(res.error);
    });
  }

  const due = customers.filter((c) => c.due > 0).sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0));
  const typed = query.trim();
  const found = search ? (search.exact ? 1 : 0) + search.byId.length + search.byName.length : 0;
  // Nothing found: a typed ID starts the new customer's ID; typed words (a name) start their name.
  const typedIsId = typed !== "" && !/\s/.test(typed) && (!numeric || /^\d+$/.test(typed));
  const addFromTyped = typed !== "" && found === 0;

  return (
    <div className="page narrow cq-main crm-page">
      <Link className="crm-back" href={workBoardHref(board.id)}>
        <Icon name="back" />
        {board.name}
      </Link>

      <section className="card crm-find" aria-label="Find a customer">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            openBest();
          }}
        >
          <label className="crm-find-l" htmlFor={`${id}-q`}>
            Find by customer ID
          </label>
          <div className="crm-find-row" style={{ marginTop: 6 }}>
            <div className="crm-search">
              <Icon name="search" />
              <input
                id={`${id}-q`}
                ref={inputRef}
                className="crm-input"
                type="search"
                inputMode={numericKeys ? "numeric" : "text"}
                enterKeyHint="go"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder={numericKeys ? "ID number" : "ID, or a name"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-describedby={`${id}-sum`}
              />
            </div>
            {numeric && (
              <button
                type="button"
                className="crm-kb"
                aria-label={letters ? "123: number keyboard" : "ABC: letter keyboard, to search by name"}
                onClick={() => {
                  setLetters((l) => !l);
                  // Back to the field, so the phone opens the other keyboard.
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                {letters ? "123" : "ABC"}
              </button>
            )}
          </div>
        </form>
        <div className="crm-find-actions">
          <p className="t-meta" id={`${id}-sum`} aria-live="polite" style={{ margin: 0 }}>
            {typed
              ? found === 0
                ? `No customer with ID “${typed}”.`
                : search?.exact
                  ? "Exact ID first. Enter opens it."
                  : `${found} found.`
              : customers.length === 0
                ? "No customers yet."
                : `${customers.length} customer${customers.length === 1 ? "" : "s"}.`}
          </p>
          <Button variant="secondary" icon="plus" onClick={() => (addFromTyped && typedIsId ? openAdd(typed) : openAdd(suggestion ?? "", addFromTyped ? typed : ""))}>
            {addFromTyped && typedIsId ? "Add this ID" : "Add customer"}
          </Button>
        </div>
      </section>

      {search ? (
        <>
          {search.exact && <Group title="ID match" boardId={board.id} list={[search.exact]} exact />}
          <Group title={search.exact ? "IDs that start the same" : `IDs starting “${search.query}”`} boardId={board.id} list={search.byId} />
          <Group title="Name matches" boardId={board.id} list={search.byName} />
        </>
      ) : customers.length === 0 ? (
        <section className="card crm-empty" aria-label="No customers yet">
          <h2>Your customer list is empty</h2>
          <p>Add a customer with their own ID number. You find them again by that ID, log what happens with them, and schedule tasks that remind you.</p>
          <Button variant="primary" icon="plus" onClick={() => openAdd(suggestion ?? "")}>
            Add the first customer
          </Button>
        </section>
      ) : (
        <>
          <Group title="Due today" aside={`${due.length}`} boardId={board.id} list={due} />
          <section className="card crm-group" aria-label="All customers">
            <h2 className="crm-group-h">
              All customers
              <span className="aside">by ID</span>
            </h2>
            <ul className="crm-list">
              {customers.slice(0, LIST_MAX).map((c) => (
                <li key={c.id}>
                  <CustomerRow boardId={board.id} c={c} />
                </li>
              ))}
            </ul>
            {customers.length > LIST_MAX && (
              <p className="crm-more">
                Showing {LIST_MAX} of {customers.length}. Search by ID for the rest.
              </p>
            )}
          </section>
        </>
      )}

      {archived.length > 0 && (
        <details className="card crm-arch">
          <summary>
            <Icon name="chev" />
            Archived · {archived.length}
          </summary>
          <ul className="crm-list">
            {archived.map((c) => (
              <li key={c.id} className="crm-arch-row">
                <span className="crm-num">#{c.number}</span>
                <span className="crm-row-main">
                  <b>{c.name}</b>
                </span>
                <Button variant="secondary" onClick={() => restore(c)} disabled={restoring !== null}>
                  {restoring === c.id ? "Restoring…" : "Restore"}
                </Button>
              </li>
            ))}
          </ul>
          {archError && (
            <p className="crm-error" role="alert" style={{ padding: "0 14px 12px" }}>
              {archError}
            </p>
          )}
        </details>
      )}

      <CustomerFormSheet
        key={addKey}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add customer"
        description={`On ${board.name}. Their ID is how you find them.`}
        initial={{ number: addInitial.number, name: addInitial.name, nickname: "", phone: "" }}
        numericId={numeric || /^\d+$/.test(addInitial.number)}
        others={customers}
        submitLabel="Add customer"
        onSave={async (value) => {
          const res = await createCustomer(board.id, value);
          if (!res.ok) return res.error;
          setAddOpen(false);
          router.push(customerHref(board.id, res.value.id));
          return null;
        }}
      />
    </div>
  );
}
