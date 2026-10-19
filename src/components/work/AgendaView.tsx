"use client";

/**
 * A work tab's Agenda (the Office workspace's home, /today/work/<id>; scheduled-tasks.ts agendaOf): Overdue (in the
 * owed ink, never alarm red), Today, Upcoming (the next 14 days), Later (a count, opened on a tap) and Done (today and
 * the 7 days before, folded). Each row is a ScheduledRow (Done, Snooze, Call and Text, a tap to edit). Nothing to do:
 * one calm line and "Schedule a task".
 *
 * ?task=<id> (a reminder's tap, the bell, the search; an old customer task's id resolves to its task) and
 * ?callback=<id> (an old call back's link): the page resolved it; that row's section opens, the row is scrolled to,
 * focused and highlighted for HIGHLIGHT_MS, then the parameter leaves the address so a reload does not do it again.
 * One that is not on the agenda is said in one line.
 *
 * From 900 px a side column holds "Customers to watch" (for now: the customers with an overdue task; Phase 2's
 * follow-up alerts take this place) and a quick customer search (the same matcher as the header).
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { customerHref, customersHref } from "@/lib/customers";
import { customerLabelOf, matchCustomers, prepareIndex } from "@/lib/customer-search";
import {
  AGENDA_SECTIONS,
  LEGACY_CALLBACK_PARAM,
  TASK_PARAM,
  agendaOf,
  customersToWatchOf,
  rowWhenOf,
  taskAnchorId,
  type AgendaSectionId,
  type ScheduledView,
} from "@/lib/scheduled-tasks";
import { motionLevel } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ScheduledRow } from "./ScheduledRow";
import { CustomerResult } from "./WorkSearch";
import { useScheduledActions } from "./useScheduledActions";
import { openScheduledSheet, useWorkContext } from "./work-store";

/** How long a row a link asked for stays highlighted. */
export const HIGHLIGHT_MS = 6000;
export const AGENDA_MISSING_LINE = "That task is not on this agenda: it was archived, done more than a week ago, or it belongs to another tab.";
export const AGENDA_EMPTY_LINE = "Nothing scheduled. Plan your next call, visit or email, and it is reminded at its time.";

export function AgendaView({ board, rows, focus, focusMissing, nowIso }: { board: { id: string; name: string; crmOn: boolean }; rows: ScheduledView[]; focus: string | null; focusMissing: boolean; nowIso: string }) {
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const agenda = useMemo(() => agendaOf(rows, now), [rows, now]);
  const actions = useScheduledActions();
  const [highlight, setHighlight] = useState<string | null>(null);
  const [laterOpen, setLaterOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [missing, setMissing] = useState(focusMissing);
  const watch = useMemo(() => customersToWatchOf(agenda.overdue), [agenda.overdue]);
  const total = rows.length;

  // The link's focus: open its section, highlight it, then drop the parameter (deferred, like the board's ?sheet=).
  useEffect(() => {
    if (!focus && !focusMissing) return;
    const raf = window.requestAnimationFrame(() => {
      if (focus) {
        if (agenda.later.some((r) => r.id === focus)) setLaterOpen(true);
        if (agenda.done.some((r) => r.id === focus)) setDoneOpen(true);
        setHighlight(focus);
      }
      setMissing(focusMissing);
      const params = new URLSearchParams(window.location.search);
      params.delete(TASK_PARAM);
      params.delete(LEGACY_CALLBACK_PARAM);
      const q = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [focus, focusMissing, agenda]);

  // Once the row is drawn: scroll to it (motion-aware), focus it, and let the highlight fade.
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(taskAnchorId(highlight));
    if (el) {
      el.scrollIntoView({ block: "center", behavior: motionLevel() === "still" ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }
    const t = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const list = (id: AgendaSectionId, items: ScheduledView[]) => (
    <ol className="st-list">
      {items.map((t) => (
        <ScheduledRow
          key={t.id}
          task={t}
          now={now}
          section={id}
          highlighted={highlight === t.id}
          busy={actions.busy === t.id}
          onDone={() => actions.done(t)}
          onReopen={() => actions.reopen(t)}
          onSnooze={(p) => actions.snooze(t, p)}
          onEdit={() => openScheduledSheet({ task: t })}
        />
      ))}
    </ol>
  );

  return (
    <div className="page cq-main wk-agenda">
      <div className="wk-agenda-grid">
        <div className="wk-agenda-main">
          {missing && (
            <p className="wk-note" role="status">
              {AGENDA_MISSING_LINE}
            </p>
          )}
          {actions.error && (
            <p className="wk-note" role="alert">
              {actions.error}
            </p>
          )}
          {total === 0 || (agenda.overdue.length + agenda.today.length + agenda.upcoming.length + agenda.later.length + agenda.done.length === 0) ? (
            <section className="card wk-empty" aria-label="Nothing scheduled">
              <p>{AGENDA_EMPTY_LINE}</p>
              <Button variant="primary" icon="plus" onClick={() => openScheduledSheet()} aria-haspopup="dialog">
                Schedule a task
              </Button>
            </section>
          ) : (
            AGENDA_SECTIONS.map(({ id, title }) => {
              const items = agenda[id];
              if (id !== "today" && items.length === 0) return null;
              const hid = `wk-sec-${id}`;
              if (id === "later") {
                return (
                  <section key={id} className="card wk-sec" data-sec={id} aria-labelledby={hid}>
                    <h2 id={hid} className="wk-sec-h">
                      <button type="button" className="wk-sec-toggle" aria-expanded={laterOpen} onClick={() => setLaterOpen((o) => !o)}>
                        <Icon name="chev" />
                        {title}
                        <span className="wk-count">{items.length}</span>
                      </button>
                    </h2>
                    {laterOpen && list(id, items)}
                  </section>
                );
              }
              if (id === "done") {
                return (
                  <section key={id} className="card wk-sec" data-sec={id} aria-labelledby={hid}>
                    <h2 id={hid} className="wk-sec-h">
                      <button type="button" className="wk-sec-toggle" aria-expanded={doneOpen} onClick={() => setDoneOpen((o) => !o)}>
                        <Icon name="chev" />
                        {title}
                        <span className="wk-count">{items.length}</span>
                        <span className="wk-sec-aside">today and the past week</span>
                      </button>
                    </h2>
                    {doneOpen && list(id, items)}
                  </section>
                );
              }
              return (
                <section key={id} className="card wk-sec" data-sec={id} aria-labelledby={hid}>
                  <h2 id={hid} className="wk-sec-h">
                    <span className="wk-sec-t">{title}</span>
                    <span className="wk-count">{items.length}</span>
                  </h2>
                  {items.length === 0 ? <p className="wk-sec-note">Nothing left today.</p> : list(id, items)}
                </section>
              );
            })
          )}
        </div>
        <aside className="wk-side" aria-label="Customers">
          {board.crmOn ? (
            <>
              <section className="card wk-side-card" aria-labelledby="wk-watch-h">
                <h2 id="wk-watch-h" className="wk-sec-h">
                  <span className="wk-sec-t">Customers to watch</span>
                  <span className="wk-count">{watch.length}</span>
                </h2>
                {watch.length === 0 ? (
                  <p className="wk-sec-note">No customer has an overdue task.</p>
                ) : (
                  <ul className="wk-watch">
                    {watch.slice(0, 8).map((w) => (
                      <li key={w.customer.id}>
                        <Link className="wk-watch-row" href={customerHref(board.id, w.customer.id)}>
                          <span className="wk-watch-n">{customerLabelOf(w.customer)}</span>
                          <span className="wk-watch-s">
                            {w.overdue} overdue · since {rowWhenOf({ dueAt: w.oldest, allDay: true }, now).day}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <QuickCustomerSearch boardId={board.id} />
            </>
          ) : (
            <section className="card wk-side-card">
              <p className="wk-sec-note">This tab keeps no customer list. Turn it on in the tab&apos;s menu (⋯) to link customers to tasks.</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The side column's quick customer search: the header's matcher over the frame's index, the top five as links. */
function QuickCustomerSearch({ boardId }: { boardId: string }) {
  const { index } = useWorkContext();
  const [q, setQ] = useState("");
  const prepared = useMemo(() => (index ? prepareIndex(index.customers) : null), [index]);
  const found = prepared ? matchCustomers(prepared, q, { limit: 5 }) : null;
  return (
    <section className="card wk-side-card" aria-labelledby="wk-quick-h">
      <h2 id="wk-quick-h" className="wk-sec-h">
        <span className="wk-sec-t">Find a customer</span>
      </h2>
      <div className="wk-quick">
        <input className="st-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, name or phone" aria-label="Find a customer by ID, name or phone" autoComplete="off" spellCheck={false} />
        {found && (
          <ul className="wk-watch" aria-label="Matching customers">
            {found.results.map((m) => (
              <li key={m.entry.id}>
                <Link className="wk-watch-row" href={customerHref(boardId, m.entry.id)}>
                  <CustomerResult m={m} />
                </Link>
              </li>
            ))}
            {found.total > found.results.length && (
              <li>
                <Link className="wk-watch-row" href={`${customersHref(boardId)}?q=${encodeURIComponent(q.trim())}`}>
                  +{found.total - found.results.length} more · open the list
                </Link>
              </li>
            )}
            {found.total === 0 && <li className="wk-sec-note">No customer matches.</li>}
          </ul>
        )}
      </div>
    </section>
  );
}
