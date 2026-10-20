"use client";

/**
 * One customer (/today/work/<id>/customers/<customerId>; customers.ts, crm.ts), as tabs since Phase 2 (2026-10-20, the
 * user's CRM-style page). Above the tabs, on every one: their ID, name and nickname, their status (a menu: Lead ·
 * Prospect · Customer · Inactive), their tags, and Edit (and Archive, inside it). The tabs:
 *
 *   Overview   contact (a 44 px tap to call, to text, to email), company, address; a follow-up's why and "Schedule
 *              follow-up"; the next scheduled task, the last contact, open collections, open deals' value
 *   Tasks      their scheduled tasks grouped by task collection (CustomerTasks)
 *   Check      Rate, Home, Work and Record at, newest first (CustomerChecks)
 *   Info       what is known about them, newest recorded first (the detail, three lines then "More", and when it
 *              was recorded), each editable and archivable (with Undo)
 *   History    the interaction log, newest first (Call, Visit, Email and Message too), each editable and archivable
 *   Orders     their lines on the tab's order list (components/orders/CustomerOrders.tsx, handed in by the page),
 *              only while the tab keeps one
 *   Deals      their deals (components/deals/CustomerDeals.tsx)
 *
 * The strip is a tablist (role="tablist", roving focus: ←/→, Home, End move and select; one Tab stop), a segmented
 * strip that scrolls inside itself on a 344 px phone, never the page. The tab lives in the address (?tab=, kept with
 * replaceState); `?task=<id>` lands on Tasks with that task highlighted and scrolled into view.
 */
import { useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
import { setCustomerStatus } from "@/app/actions/crm";
import {
  CUSTOMER_ACTION_LABEL,
  customersHref,
  infoLooksLong,
  infoRecordedLabel,
  localInputOf,
  whenLabel,
  type CrmBoardView,
  type CustomerDetail,
  type CustomerInfoView,
  type InteractionView,
} from "@/lib/customers";
import {
  CUSTOMER_STATUSES,
  CUSTOMER_TAB_LABEL,
  STATUS_LABEL,
  TAB_PARAM,
  customerTabsOf,
  groupByCollection,
  nextTabIndex,
  recentTagsOf,
  type CollectionOrderRef,
  type CollectionView,
  type CustomerCheckView,
  type CustomerTab,
  type FollowUpView,
} from "@/lib/crm";
import { openDealsOf, type DealView } from "@/lib/deals";
import { TASK_PARAM, type ScheduledView } from "@/lib/scheduled-tasks";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { pushToast } from "@/components/ui/toast-store";
import { ActionMark } from "@/components/work/ChannelGlyph";
import { WorkMenu } from "@/components/work/WorkMenu";
import { useWorkContext } from "@/components/work/work-store";
import { CustomerDeals } from "@/components/deals/CustomerDeals";
import { CustomerChecks } from "./CustomerChecks";
import { CustomerOverview } from "./CustomerOverview";
import { CustomerTasks } from "./CustomerTasks";
import { CustomerFormSheet, InfoSheet, InteractionSheet, UNREACHABLE, type InfoFormValue, type InteractionFormValue } from "./CustomerSheets";
import { StatusChip } from "./StatusChip";

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

/**
 * The tabs: a tablist with roving focus (only the selected tab is a Tab stop; ←/→ wrap, Home and End jump, each move
 * selects), a segmented strip that scrolls inside itself (the selected one kept in view), each tab with its quiet
 * count when it has one.
 */
function TabStrip({ ids, tabs, tab, counts, label, onTab }: { ids: string; tabs: CustomerTab[]; tab: CustomerTab; counts: Partial<Record<CustomerTab, number>>; label: string; onTab: (t: CustomerTab) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const strip = ref.current;
    const el = strip?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!strip || !el || strip.scrollWidth <= strip.clientWidth) return;
    const r = el.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (r.left < s.left) strip.scrollLeft += r.left - s.left - 12;
    else if (r.right > s.right) strip.scrollLeft += r.right - s.right + 12;
  }, [tab]);
  return (
    <div
      ref={ref}
      className="crm-tabs"
      role="tablist"
      aria-label={label}
      onKeyDown={(e) => {
        const at = tabs.indexOf(tab);
        const next = nextTabIndex(e.key, at, tabs.length);
        if (next === null) return;
        e.preventDefault();
        onTab(tabs[next]);
        // Focus follows the selection (the button is drawn by then: the strip is never unmounted).
        window.requestAnimationFrame(() => document.getElementById(`${ids}-tab-${tabs[next]}`)?.focus());
      }}
    >
      {tabs.map((t) => (
        <button
          key={t}
          id={`${ids}-tab-${t}`}
          type="button"
          role="tab"
          className="crm-tab"
          aria-selected={t === tab}
          aria-controls={`${ids}-panel`}
          tabIndex={t === tab ? 0 : -1}
          onClick={() => onTab(t)}
        >
          {CUSTOMER_TAB_LABEL[t]}
          {(counts[t] ?? 0) > 0 && <span className="crm-tab-n">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}

export function CustomerView({
  board,
  customer,
  tasks,
  infos,
  interactions,
  checks,
  collections,
  deals,
  followUp,
  followUpDays,
  orderRefs,
  ordersOn,
  ordersTodo = 0,
  tab: askedTab,
  highlightTask,
  nowIso,
  today,
  orders = null,
}: {
  board: CrmBoardView;
  customer: CustomerDetail;
  /** Their scheduled tasks: open soonest first, then the done ones, newest first. */
  tasks: ScheduledView[];
  /** What is known about them, newest recorded first. */
  infos: CustomerInfoView[];
  interactions: InteractionView[];
  /** Phase 2 (crm-server loadCustomerCrm): their checks, collections and follow-up. */
  checks: CustomerCheckView[];
  collections: CollectionView[];
  /** Their deals (deals-server loadCustomerDeals); null where they could not be read. */
  deals: DealView[] | null;
  followUp: FollowUpView | null;
  followUpDays: number | null;
  /** Their orders, as a collection may link them; null where the order list is off. */
  orderRefs: CollectionOrderRef[] | null;
  /** The tab keeps an order list: the Orders tab is shown. */
  ordersOn: boolean;
  ordersTodo?: number;
  /** The tab the address asked for (crm.ts customerTabOf). */
  tab: CustomerTab;
  /** `?task=<id>`: the task a link asked for (resolved by the page). */
  highlightTask: string | null;
  nowIso: string;
  today: DayKey;
  /** Their lines on the tab's order list (the page draws it only while that list is on). */
  orders?: ReactNode;
}) {
  const ids = useId();
  const router = useRouter();
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const { index } = useWorkContext();
  // The sheet's data stays after it closes, so it slides away (and gives focus back) before the next one replaces it.
  const [sheet, setSheet] = useState<Sheet>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetKey, setSheetKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [, start] = useTransition();

  // The tab: the address's on arrival (and on a link to another ?tab=), then the strip's (replaceState keeps it).
  const tabs = customerTabsOf({ ordersOn });
  const [tab, setTabState] = useState<CustomerTab>(askedTab);
  const [asked, setAsked] = useState<CustomerTab>(askedTab);
  if (asked !== askedTab) {
    setAsked(askedTab);
    setTabState(askedTab);
  }
  function setTab(t: CustomerTab) {
    setTabState(t);
    const params = new URLSearchParams(window.location.search);
    if (t === "overview") params.delete(TAB_PARAM);
    else params.set(TAB_PARAM, t);
    // A highlighted task belongs to the Tasks tab: leaving it drops ?task= (a reload lands where the user is).
    if (t !== "tasks") params.delete(TASK_PARAM);
    const q = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
  }

  const grouped = useMemo(() => groupByCollection(tasks, collections), [tasks, collections]);
  const recentTags = useMemo(() => recentTagsOf(index?.customers ?? []), [index]);
  const openTasks = tasks.filter((t) => !t.doneAt).length;
  const counts: Partial<Record<CustomerTab, number>> = {
    tasks: openTasks,
    check: checks.length,
    info: infos.length,
    history: interactions.length,
    orders: ordersTodo,
    deals: deals ? openDealsOf(deals).count : 0,
  };

  function show(next: Exclude<Sheet, null>) {
    setSheetKey((k) => k + 1);
    setSheet(next);
    setSheetOpen(true);
    setConfirmArchive(false);
    setError(null);
  }

  const close = () => setSheetOpen(false);

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

  function changeStatus(status: (typeof CUSTOMER_STATUSES)[number]) {
    if (status === customer.status) return;
    const was = customer.status;
    setError(null);
    start(async () => {
      const res = await call(() => setCustomerStatus(customer.id, status, { refresh: true }));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      pushToast({
        key: `crm-status-${customer.id}`,
        title: `${customer.name}: ${STATUS_LABEL[status]}`,
        body: `Was ${STATUS_LABEL[was]}.`,
        action: { label: "Undo", onAction: () => undo(() => setCustomerStatus(customer.id, was, { refresh: true })) },
      });
    });
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

  const ordersBoard = { id: board.id, name: board.name, ordersOn };
  const who = { id: customer.id, number: customer.number, name: customer.name };
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
            {customer.company && <span className="t-meta">{customer.company}</span>}
          </div>
          <Button variant="quiet" onClick={() => show({ kind: "edit" })} aria-haspopup="dialog">
            Edit
          </Button>
        </div>
        <div className="crm-head-tags">
          <WorkMenu
            label={`Status: ${STATUS_LABEL[customer.status]}. Change it`}
            buttonClass="crm-status-btn"
            align="start"
            button={
              <>
                <StatusChip status={customer.status} />
                <Icon name="chev" />
              </>
            }
            items={CUSTOMER_STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], hint: s === customer.status ? "now" : undefined, onSelect: () => changeStatus(s) }))}
          />
          {customer.tags.length > 0 ? (
            <ul className="crm-tags" aria-label="Tags">
              {customer.tags.map((t) => (
                <li key={t} className="crm-tag">
                  {t}
                </li>
              ))}
            </ul>
          ) : (
            <span className="t-meta">No tags</span>
          )}
        </div>
      </section>

      {error && !sheetOpen && (
        <p className="crm-error" role="alert">
          {error}
        </p>
      )}

      <TabStrip ids={ids} tabs={tabs} tab={tab} counts={counts} label={`${customer.name}: tabs`} onTab={setTab} />

      <div id={`${ids}-panel`} role="tabpanel" aria-labelledby={`${ids}-tab-${tab}`} className="crm-panel">
        {tab === "overview" && (
          <CustomerOverview customer={customer} tasks={tasks} interactions={interactions} groups={grouped.open} deals={deals} followUp={followUpDays !== null ? followUp : null} now={now} onTab={setTab} />
        )}

        {tab === "tasks" && <CustomerTasks boardId={board.id} customer={who} tasks={tasks} collections={collections} highlightTask={highlightTask} now={now} ordersOn={ordersOn} orderRefs={orderRefs} />}

        {tab === "check" && <CustomerChecks customer={who} checks={checks} today={today} />}

        {tab === "info" && (
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
        )}

        {tab === "history" && (
          <section className="card crm-sec" aria-labelledby="crm-log-h">
            <div className="crm-sec-h">
              <h2 id="crm-log-h">History</h2>
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
        )}

        {tab === "orders" && orders}

        {tab === "deals" && <CustomerDeals board={ordersBoard} customer={who} deals={deals} today={today} />}
      </div>

      {sheet?.kind === "edit" && (
        <CustomerFormSheet
          key={`edit-${sheetKey}`}
          open={sheetOpen}
          onClose={close}
          title="Edit customer"
          description={`#${customer.number} on ${board.name}`}
          initial={{
            number: customer.number,
            name: customer.name,
            nickname: customer.nickname ?? "",
            phone: customer.phone ?? "",
            status: customer.status,
            email: customer.email ?? "",
            company: customer.company ?? "",
            address: customer.address ?? "",
            tags: customer.tags,
          }}
          numericId={/^\d+$/.test(customer.number)}
          selfId={customer.id}
          recentTags={recentTags}
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
