"use client";

/**
 * A work tab's customer list (/today/work/<id>/customers; customers.ts), in the Office workspace's frame. The search
 * is live (2026-10-20): the list narrows on every keystroke from the first character, with no submit, through the ONE
 * matcher the work header and the scheduled task sheet use (customer-search.ts: the exact ID, an ID's start, a name's
 * or nickname's word, anywhere in the ID or the name, a phone's digits; accents and case ignored), each row
 * "Jane Nguyen · C-1042" with the matched part marked and the nickname or phone beneath when that is what matched.
 * Enter opens the top result; Escape clears. The query stays in the address (?q=, replaceState) so the list can be
 * shared, and the header's "+n more" lands here with it. While every ID on the tab is a number the field opens the
 * numeric keyboard (a small ABC / 123 key swaps it, for a name).
 *
 * Phase 2 (crm.ts): the list filters by status (All · Lead · Prospect · Customer · Inactive, each with its count; a
 * segmented strip that scrolls inside itself on a phone) and by tag (the tab's own tags, the most used first), both in
 * the address (?status=, ?tag=) and over the search too; every row shows its status chip and its first tags; the
 * search ranks the ID and the name first and finds a company or an email as secondary matches.
 *
 * With nothing typed: the customers who need a follow-up (crm.ts followUpsOf, each with "Schedule follow-up"; the
 * Agenda's "See all" lands here, #follow-up), then those with scheduled tasks due today (overdue first), then everyone
 * by ID; a row's quiet last line is the first line of their newest info. "Add customer" opens the details sheet with the next ID suggested
 * (?new=1, the header's New › Customer, opens it on arrival). Archived customers are out of the search, folded at the
 * bottom, each with Restore.
 */
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createCustomer, restoreCustomer } from "@/app/actions/customers";
import { customerHref, dueChipText, type ArchivedCustomerItem, type CrmBoardView, type CustomerListItem } from "@/lib/customers";
import {
  DEFAULT_STATUS,
  STATUS_FILTERS,
  STATUS_FILTER_LABEL,
  STATUS_PARAM,
  TAG_PARAM,
  filterCustomers,
  recentTagsOf,
  statusCountsOf,
  statusFilterOf,
  statusParamOf,
  tagCountsOf,
  tagFilterOf,
  type FollowUpView,
  type StatusFilter,
} from "@/lib/crm";
import { matchCustomers, prepareIndex, topMatch, type CustomerMatch } from "@/lib/customer-search";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import { CustomerResult } from "@/components/work/WorkSearch";
import { FOLLOW_UP_ANCHOR, FollowUpList } from "@/components/work/FollowUps";
import { CustomerFormSheet, UNREACHABLE } from "./CustomerSheets";
import { StatusChip } from "./StatusChip";

/** A row shows at most this many of its tags (the rest are on their page). */
const ROW_TAGS = 2;

/** With nothing typed, at most this many customers are listed (the search finds the rest). */
export const LIST_MAX = 50;
/** A search shows at most this many rows (the count says how many matched). */
export const SEARCH_LIST_MAX = 200;
/** The address's query parameter: the search, shareable. */
export const QUERY_PARAM = "q";

function CustomerRow({ boardId, c, match }: { boardId: string; c: CustomerListItem; match?: CustomerMatch<CustomerListItem> }) {
  const chip = dueChipText(c);
  return (
    <Link className="crm-row" href={customerHref(boardId, c.id)} data-exact={match?.rank === 0 ? "" : undefined}>
      {match ? null : <span className="crm-num">#{c.number}</span>}
      <span className="crm-row-main">
        {match ? (
          <span className="crm-row-found">
            <CustomerResult m={match} />
          </span>
        ) : (
          <b>{c.name}</b>
        )}
        <span className="crm-row-sub">
          <StatusChip status={c.status} />
          {c.nickname && !match && <span className="t-meta">“{c.nickname}”</span>}
          {chip && <span className={cx("chip", c.overdue > 0 && "owed")}>{chip}</span>}
          {c.tags.slice(0, ROW_TAGS).map((t) => (
            <span key={t} className="crm-row-tag">
              #{t}
            </span>
          ))}
        </span>
        {c.info && <span className="crm-row-info">{c.info}</span>}
      </span>
      <Icon name="chev" />
    </Link>
  );
}

function Group({ title, aside, boardId, list }: { title: string; aside?: string; boardId: string; list: CustomerListItem[] }) {
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
            <CustomerRow boardId={boardId} c={c} />
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
  followUps = null,
}: {
  board: CrmBoardView;
  customers: CustomerListItem[];
  archived: ArchivedCustomerItem[];
  /** Every ID on the tab is a number. */
  numeric: boolean;
  /** The next ID, while they are. */
  suggestion: string | null;
  /** Who needs a follow-up (crm-server loadFollowUps); null: off, or the read failed. */
  followUps?: FollowUpView[] | null;
}) {
  const id = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get(QUERY_PARAM) ?? "");
  const [letters, setLetters] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [addInitial, setAddInitial] = useState({ number: "", name: "" });
  const [restoring, setRestoring] = useState<string | null>(null);
  const [archError, setArchError] = useState<string | null>(null);
  const [, start] = useTransition();
  // The filters (Phase 2): the address's on arrival, then the strip's and the select's (replaceState keeps them).
  const [status, setStatus] = useState<StatusFilter>(() => statusFilterOf(searchParams.get(STATUS_PARAM)));
  const [tag, setTag] = useState<string | null>(() => tagFilterOf(searchParams.get(TAG_PARAM)));
  const filtered = useMemo(() => filterCustomers(customers, { status, tag }), [customers, status, tag]);
  const index = useMemo(() => prepareIndex(filtered), [filtered]);
  const statusCounts = useMemo(() => statusCountsOf(customers), [customers]);
  const tags = useMemo(() => tagCountsOf(customers), [customers]);
  const recentTags = useMemo(() => recentTagsOf(customers), [customers]);
  const filtering = status !== "all" || tag !== null;
  // Every keystroke, in the browser: no round trip, no submit.
  const search = matchCustomers(index, query, { limit: SEARCH_LIST_MAX });
  const numericKeys = numeric && !letters;

  function openAdd(number: string, name = "") {
    setAddInitial({ number, name });
    setAddKey((k) => k + 1);
    setAddOpen(true);
  }

  // The header's New › Customer (?new=1) opens the sheet on arrival; the parameter then leaves the address.
  const wantsNew = searchParams.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    const raf = window.requestAnimationFrame(() => {
      setAddInitial({ number: suggestion ?? "", name: "" });
      setAddKey((k) => k + 1);
      setAddOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("new");
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [wantsNew, suggestion]);

  /** A filter, and the address with it (replaceState). */
  function filter(next: { status?: StatusFilter; tag?: string | null }) {
    const s = next.status ?? status;
    const t = next.tag !== undefined ? next.tag : tag;
    setStatus(s);
    setTag(t);
    const params = new URLSearchParams(window.location.search);
    if (statusParamOf(s)) params.set(STATUS_PARAM, statusParamOf(s));
    else params.delete(STATUS_PARAM);
    if (t) params.set(TAG_PARAM, t);
    else params.delete(TAG_PARAM);
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }

  /** The query, live, and in the address (replaceState: shareable, no history entry per key). */
  function type(next: string) {
    setQuery(next);
    const params = new URLSearchParams(window.location.search);
    if (next.trim()) params.set(QUERY_PARAM, next);
    else params.delete(QUERY_PARAM);
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }

  function openBest() {
    const pick = topMatch(search);
    if (pick) router.push(customerHref(board.id, pick.entry.id));
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

  const due = filtered.filter((c) => c.due > 0).sort((a, b) => Number(b.overdue > 0) - Number(a.overdue > 0));
  const keptIds = new Set(filtered.map((c) => c.id));
  const follow = followUps ? followUps.filter((f) => keptIds.has(f.customer.id)) : null;
  const typed = query.trim();
  const found = search?.total ?? 0;
  // Nothing found: a typed ID starts the new customer's ID; typed words (a name) start their name.
  const typedIsId = typed !== "" && !/\s/.test(typed) && (!numeric || /^\d+$/.test(typed));
  const addFromTyped = typed !== "" && found === 0;

  return (
    <div className="page narrow cq-main crm-page">
      <section className="card crm-find" aria-label="Find a customer">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            openBest();
          }}
        >
          <label className="crm-find-l" htmlFor={`${id}-q`}>
            Find a customer
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
                placeholder={numericKeys ? "ID or phone" : "ID, name, nickname or phone"}
                value={query}
                onChange={(e) => type(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.preventDefault();
                    type("");
                  }
                }}
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
                ? `No customer matches “${typed}”.`
                : search?.results[0]?.rank === 0
                  ? `${found} found. The exact ID is first; Enter opens it.`
                  : `${found} found. Enter opens the first.`
              : customers.length === 0
                ? "No customers yet."
                : filtering
                  ? `${filtered.length} of ${customers.length} customer${customers.length === 1 ? "" : "s"}.`
                  : `${customers.length} customer${customers.length === 1 ? "" : "s"}.`}
          </p>
          <Button variant="secondary" icon="plus" onClick={() => (addFromTyped && typedIsId ? openAdd(typed) : openAdd(suggestion ?? "", addFromTyped ? typed : ""))}>
            {addFromTyped && typedIsId ? "Add this ID" : "Add customer"}
          </Button>
        </div>
        {customers.length > 0 && (
          <div className="crm-filters">
            <fieldset className="crm-seg">
              <legend className="sr-only">Status</legend>
              {STATUS_FILTERS.map((f) => (
                <label key={f} className="crm-seg-o">
                  <input type="radio" name={`${id}-status`} value={f} checked={status === f} onChange={() => filter({ status: f })} />
                  {STATUS_FILTER_LABEL[f]}
                  <span className="ord-n">{statusCounts[f]}</span>
                </label>
              ))}
            </fieldset>
            {tags.length > 0 && (
              <div className="crm-tagfilter">
                <label className="sr-only" htmlFor={`${id}-tag`}>
                  Tag
                </label>
                <select id={`${id}-tag`} className="crm-input crm-select" value={tag ?? ""} onChange={(e) => filter({ tag: e.target.value || null })}>
                  <option value="">Any tag</option>
                  {tags.map((t) => (
                    <option key={t.tag} value={t.tag}>
                      #{t.tag} ({t.count})
                    </option>
                  ))}
                  {tag && !tags.some((t) => t.tag === tag) && <option value={tag}>#{tag} (0)</option>}
                </select>
              </div>
            )}
          </div>
        )}
      </section>

      {search ? (
        found > 0 && (
          <section className="card crm-group" aria-label="Matching customers">
            <h2 className="crm-group-h">
              Matches
              <span className="aside">{found > search.results.length ? `the first ${search.results.length} of ${found}` : `${found}`}</span>
            </h2>
            <ul className="crm-list">
              {search.results.map((m) => (
                <li key={m.entry.id}>
                  <CustomerRow boardId={board.id} c={m.entry} match={m} />
                </li>
              ))}
            </ul>
          </section>
        )
      ) : customers.length > 0 && filtered.length === 0 ? (
        <section className="card crm-empty" aria-label="No customer in this filter">
          <h2>No customer here</h2>
          <p>No {status !== "all" ? STATUS_FILTER_LABEL[status].toLowerCase() : "customer"}{tag ? ` tagged #${tag}` : ""} on this tab.</p>
          <Button variant="secondary" onClick={() => filter({ status: "all", tag: null })}>
            Show everyone
          </Button>
        </section>
      ) : customers.length === 0 ? (
        <section className="card crm-empty" aria-label="No customers yet">
          <h2>Your customer list is empty</h2>
          <p>Add a customer with their own ID number. You find them again by that ID or their name, log what happens with them, and schedule tasks that remind you.</p>
          <Button variant="primary" icon="plus" onClick={() => openAdd(suggestion ?? "")}>
            Add the first customer
          </Button>
        </section>
      ) : (
        <>
          {follow && follow.length > 0 && (
            <section className="card crm-group" id={FOLLOW_UP_ANCHOR} aria-label="Follow up">
              <h2 className="crm-group-h">
                Follow up
                <span className="aside">{follow.length}</span>
              </h2>
              <FollowUpList boardId={board.id} rows={follow} max={LIST_MAX} />
            </section>
          )}
          <Group title="Due today" aside={`${due.length}`} boardId={board.id} list={due} />
          <section className="card crm-group" aria-label={filtering ? "The filtered customers" : "All customers"}>
            <h2 className="crm-group-h">
              {filtering ? "Customers" : "All customers"}
              <span className="aside">by ID</span>
            </h2>
            <ul className="crm-list">
              {filtered.slice(0, LIST_MAX).map((c) => (
                <li key={c.id}>
                  <CustomerRow boardId={board.id} c={c} />
                </li>
              ))}
            </ul>
            {filtered.length > LIST_MAX && (
              <p className="crm-more">
                Showing {LIST_MAX} of {filtered.length}. Search by ID or name for the rest.
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
        initial={{ number: addInitial.number, name: addInitial.name, nickname: "", phone: "", status: status === "all" ? DEFAULT_STATUS : status, email: "", company: "", address: "", tags: tag ? [tag] : [] }}
        numericId={numeric || /^\d+$/.test(addInitial.number)}
        others={customers}
        recentTags={recentTags}
        submitLabel="Add customer"
        onSave={async (value) => {
          const res = await createCustomer(board.id, value, { refresh: true });
          if (!res.ok) return res.error;
          setAddOpen(false);
          router.push(customerHref(board.id, res.value.id));
          return null;
        }}
      />
    </div>
  );
}
