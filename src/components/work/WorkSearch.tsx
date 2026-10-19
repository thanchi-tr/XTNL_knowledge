"use client";

/**
 * The work header's search (2026-10-20): live as you type, from the first character, no submit. One combobox over a
 * listbox: the tab's customers (customer-search.ts matchCustomers: the exact ID, an ID's start, a name's or nickname's
 * word, anywhere in the ID or the name, a phone's digits), each "Jane Nguyen · C-1042" with the matched part marked
 * and the nickname or phone beneath when that is what matched, at most SEARCH_CAP with a "+n more" line to the full
 * list on the Customers page (?q=); then the tab's scheduled tasks by title, in their own group.
 *
 * Fast: it matches in the browser over the index the work frame loaded once (scheduled-tasks-server loadWorkIndex):
 * a keystroke costs no server action and no fetch (scheduled-tasks-check pins it). Only when that index is missing
 * does it ask the server (searchWorkFallback), after a short pause.
 *
 * Keys: ArrowDown / ArrowUp move (aria-activedescendant; the input keeps focus), Enter opens the active option or the
 * top result, Escape clears the field (and closes the list). A polite line says how many matched.
 */
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { searchWorkFallback } from "@/app/actions/scheduled-tasks";
import {
  customerLabelOf,
  digitsOf,
  highlightParts,
  matchCustomers,
  matchTitles,
  prepareIndex,
  type CustomerMatch,
  type Range,
  type TaskMatch,
  type WorkIndex,
} from "@/lib/customer-search";
import { customerHref, customersHref } from "@/lib/customers";
import { scheduledTaskHref, whenLineOf } from "@/lib/scheduled-tasks";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/cx";
import type { WorkFrameBoard } from "./work-store";

/** The matched parts of a text, marked (<mark>, styled with tokens in work.css). */
export function Marked({ text, ranges }: { text: string; ranges: readonly Range[] }): ReactNode {
  return highlightParts(text, ranges).map((p, i) => (p.mark ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>));
}

/** A customer result's two lines: name · ID (both marked where they matched), and the nickname or phone (its digits) that matched. */
export function CustomerResult({ m }: { m: CustomerMatch }) {
  const e = m.entry;
  return (
    <>
      <span className="wk-res-main">
        <b>
          <Marked text={e.name} ranges={m.ranges.name} />
        </b>
        <span aria-hidden="true"> · </span>
        <span className="wk-res-id">
          <Marked text={e.number} ranges={m.ranges.number} />
        </span>
      </span>
      {m.field === "nickname" && e.nickname && (
        <span className="wk-res-sub">
          “<Marked text={e.nickname} ranges={m.ranges.nickname} />”
        </span>
      )}
      {m.field === "phone" && e.phone && (
        <span className="wk-res-sub">
          Phone <Marked text={digitsOf(e.phone)} ranges={m.ranges.phone} />
        </span>
      )}
    </>
  );
}

type Option = { id: string; kind: "customer"; m: CustomerMatch } | { id: string; kind: "more"; n: number } | { id: string; kind: "task"; t: TaskMatch };

const FALLBACK_PAUSE_MS = 250;

export function WorkSearch({ board, index, nowIso }: { board: WorkFrameBoard; index: WorkIndex | null; nowIso: string }) {
  const id = useId();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [fallback, setFallback] = useState<{ q: string; customers: CustomerMatch[]; more: number; tasks: TaskMatch[] } | null>(null);
  const deferred = useDeferredValue(query);
  const prepared = useMemo(() => (index ? prepareIndex(index.customers) : null), [index]);
  // The clock the task lines read ("Today · 14:30"): the frame's render, moved on each time the field takes focus.
  const [clock, setClock] = useState(nowIso);
  const now = useMemo(() => new Date(clock), [clock]);

  // The browser's own match: no round trip.
  const local = useMemo(() => {
    if (!prepared || !index) return null;
    const customers = board.crmOn ? matchCustomers(prepared, deferred) : null;
    const tasks = matchTitles(index.tasks, deferred);
    return { customers: customers?.results ?? [], more: customers ? customers.total - customers.results.length : 0, tasks: tasks?.results ?? [] };
  }, [prepared, index, board.crmOn, deferred]);

  // Only without an index: the same engine on the server, after a short pause.
  useEffect(() => {
    if (index || !deferred.trim()) return;
    const q = deferred;
    const t = window.setTimeout(() => {
      void searchWorkFallback(board.id, q)
        .then((res) => {
          if (res.ok) setFallback({ q, ...res.value });
        })
        .catch(() => undefined);
    }, FALLBACK_PAUSE_MS);
    return () => window.clearTimeout(t);
  }, [index, deferred, board.id]);

  const found = local ?? (fallback && fallback.q === deferred ? fallback : null);
  const typed = query.trim() !== "";
  const options: Option[] = [];
  if (found && typed) {
    for (const m of found.customers) options.push({ id: `${id}-c-${m.entry.id}`, kind: "customer", m });
    if (found.more > 0) options.push({ id: `${id}-more`, kind: "more", n: found.more });
    for (const t of found.tasks) options.push({ id: `${id}-t-${t.entry.id}`, kind: "task", t });
  }
  const shown = open && typed;
  const at = Math.min(active, Math.max(0, options.length - 1));
  const activeId = shown && options.length > 0 ? options[at].id : undefined;
  const customerCount = found ? found.customers.length + found.more : 0;
  const taskCount = found ? found.tasks.length : 0;
  const countLine = !typed
    ? ""
    : !found
      ? "Searching…"
      : customerCount + taskCount === 0
        ? `Nothing matches “${query.trim()}”.`
        : [board.crmOn ? `${customerCount} customer${customerCount === 1 ? "" : "s"}` : null, `${taskCount} task${taskCount === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

  function go(o: Option | undefined) {
    if (!o) return;
    setOpen(false);
    if (o.kind === "customer") router.push(customerHref(board.id, o.m.entry.id));
    else if (o.kind === "more") router.push(`${customersHref(board.id)}?q=${encodeURIComponent(query.trim())}`);
    else router.push(scheduledTaskHref(board.id, o.t.entry.id));
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a + 1) % options.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (options.length ? (a - 1 + options.length) % options.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(options[at]);
    } else if (e.key === "Escape") {
      if (query || open) {
        e.preventDefault();
        setQuery("");
        setOpen(false);
        setActive(0);
      }
    }
  }

  const placeholder = board.crmOn ? "Customer ID, name, phone or task" : "Search scheduled tasks";
  return (
    <div className="wk-search">
      <label className="sr-only" htmlFor={`${id}-q`}>
        Search {board.name}
      </label>
      <Icon name="search" className="wk-search-i" />
      <input
        ref={inputRef}
        id={`${id}-q`}
        className="wk-search-in"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={`${id}-list`}
        aria-activedescendant={activeId}
        aria-describedby={`${id}-count`}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="go"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => {
          setOpen(true);
          setClock(new Date().toISOString());
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKey}
      />
      <p id={`${id}-count`} className="sr-only" aria-live="polite">
        {countLine}
      </p>
      <div id={`${id}-list`} role="listbox" aria-label={`Results in ${board.name}`} className="wk-results" hidden={!shown}>
        {shown && options.length === 0 && <p className="wk-res-none">{countLine}</p>}
        {shown && found && found.customers.length > 0 && (
          <div role="group" aria-label="Customers" className="wk-res-group">
            <p className="wk-res-h" aria-hidden="true">
              Customers
            </p>
            {options.map((o, i) =>
              o.kind === "customer" || o.kind === "more" ? (
                <div
                  key={o.id}
                  id={o.id}
                  role="option"
                  aria-selected={i === at}
                  aria-label={o.kind === "customer" ? customerLabelOf(o.m.entry) : `${o.n} more customers: open the full list`}
                  className={cx("wk-res", o.kind === "more" && "more")}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => go(o)}
                >
                  {o.kind === "customer" ? <CustomerResult m={o.m} /> : <span className="wk-res-main">+{o.n} more · open the list</span>}
                </div>
              ) : null
            )}
          </div>
        )}
        {shown && found && found.tasks.length > 0 && (
          <div role="group" aria-label="Scheduled tasks" className="wk-res-group">
            <p className="wk-res-h" aria-hidden="true">
              Scheduled tasks
            </p>
            {options.map((o, i) =>
              o.kind === "task" ? (
                <div key={o.id} id={o.id} role="option" aria-selected={i === at} className="wk-res" onMouseDown={(e) => e.preventDefault()} onClick={() => go(o)}>
                  <span className="wk-res-main">
                    <Marked text={o.t.entry.title} ranges={o.t.ranges} />
                  </span>
                  <span className="wk-res-sub">
                    {o.t.entry.done ? "Done · " : ""}
                    {whenLineOf(o.t.entry, now)}
                  </span>
                </div>
              ) : null
            )}
          </div>
        )}
      </div>
    </div>
  );
}
