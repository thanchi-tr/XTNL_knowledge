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

/** The customer a task starts with, as the picker shows it. */
function customerOf(req: SheetRequest, index: WorkIndex | null): { id: string; number: string; name: string } | null {
  if (req.task?.customer) return req.task.customer;
  if (!req.customerId) return null;
  const c = index?.customers.find((x) => x.id === req.customerId);
  return c ? { id: c.id, number: c.number, name: c.name } : null;
}

function ScheduledTaskSheet({ req, board, index }: { req: SheetRequest; board: WorkFrameBoard; index: WorkIndex | null }) {
  const ids = useId();
  const edit = req.task;
  const [title, setTitle] = useState(edit?.title ?? "");
  const [day, setDay] = useState(req.when.slice(0, 10));
  const [time, setTime] = useState(edit?.allDay ? "09:00" : req.when.slice(11, 16));
  const [allDay, setAllDay] = useState(edit?.allDay ?? false);
  const [channel, setChannel] = useState<Channel>(edit?.channel ?? "CALL");
  const [customer, setCustomer] = useState(() => customerOf(req, index));
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

  function input(): ScheduledTaskInput {
    return { title, detail, when: allDay ? day : `${day}T${time}`, allDay, channel, remind, customerId: customer?.id ?? null };
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
    setError(null);
    start(async () => {
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
