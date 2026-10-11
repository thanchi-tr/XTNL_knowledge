"use client";

/**
 * A work tab's call backs (2026-10-12; callbacks.ts holds the rules): the "Call backs" section TodayBoard mounts
 * in its call-backs slot on a work tab. Newest first, CALLBACK_SHOWN at a time with "Show more"; each card says
 * when the call happened, how (a glyph and a word), its brief as tag chips, its customer (a CRM tab), its
 * call-back task (title, done or open) and its reminder (when, how, set / due / sent). Add and Edit open
 * CallBackSheet; Archive (in the sheet) and Done (on an open reminder) each leave an Undo.
 *
 * `?callback=<id>` (a reminder's tap, redirected by /today?board=): that card is shown (past "Show more" if need
 * be), scrolled to, focused and highlighted for HIGHLIGHT_MS; then the parameter leaves the address so a reload
 * does not do it again. An id that is not here says so in one line.
 */
import "./callbacks.css";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { archiveCallBack, clearCallBackReminder, restoreCallBack, restoreCallBackReminder } from "@/app/actions/callbacks";
import {
  ACTION_WORDS,
  CALLBACK_LOAD_MAX,
  CALLBACK_PARAM,
  CALLBACK_SHOWN,
  briefOf,
  callBackAnchorId,
  defaultRemindWall,
  focusIdOf,
  reminderOpen,
  reminderStateOf,
  wallOfInstant,
  whenLabel,
  type CallBackView,
  type CallBacksData,
} from "@/lib/callbacks";
import { motionLevel } from "@/lib/motion";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { ActionGlyph } from "./ActionGlyph";
import { CallBackSheet, type CallBackSheetState } from "./CallBackSheet";

/** How long a card a reminder's tap asked for stays highlighted. */
export const HIGHLIGHT_MS = 6000;
export const CALLBACKS_HEADING_ID = "cb-heading";
const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";
const MISSING_LINE = "That call back is no longer on this tab: it was archived, or it belongs to another tab.";

const nonce = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

export function CallBacksSection({ data }: { data: CallBacksData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const now = useMemo(() => new Date(data.nowIso), [data.nowIso]);
  const [shown, setShown] = useState(CALLBACK_SHOWN);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [sheet, setSheet] = useState<CallBackSheetState | null>(null);

  const rows = data.rows.filter((r) => !hidden.has(r.id));
  // The reminder's tap: an id in the address that names a card here (the page read it, older ones too).
  const wanted = focusIdOf(searchParams.get(CALLBACK_PARAM));
  const target = wanted && rows.some((r) => r.id === wanted) ? wanted : null;
  const askedMissing = wanted != null && target == null;

  useEffect(() => {
    if (!wanted) return;
    // Deferred, like the board's ?sheet=: a cancelled first run (Strict Mode) leaves the parameter for the second.
    const raf = window.requestAnimationFrame(() => {
      if (target) {
        const at = data.rows.filter((r) => !hidden.has(r.id)).findIndex((r) => r.id === target);
        setShown((n) => Math.max(n, at + 1));
        setHighlight(target);
        setMissing(false);
      } else if (askedMissing) {
        setMissing(true);
      }
      const params = new URLSearchParams(window.location.search);
      params.delete(CALLBACK_PARAM);
      const q = params.toString();
      // `null` state, as the Next docs show: the router patches replaceState and keeps its search params in step.
      window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}${window.location.hash}`);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [wanted, target, askedMissing, data.rows, hidden]);

  // Once the card is drawn: scroll to it, focus it (a screen reader lands on it), and let the highlight fade.
  useEffect(() => {
    if (!highlight) return;
    const el = document.getElementById(callBackAnchorId(highlight));
    if (el) {
      el.scrollIntoView({ block: "center", behavior: motionLevel() === "still" ? "auto" : "smooth" });
      el.focus({ preventScroll: true });
    }
    const t = window.setTimeout(() => setHighlight(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [highlight]);

  const visible = rows.slice(0, shown);
  const rest = rows.length - visible.length;
  const openCount = rows.filter((r) => reminderOpen({ remindAt: r.remindAt, task: r.task }, now)).length;
  const aside = rows.length === 0 ? "none yet" : openCount > 0 ? `${openCount} due · ${rows.length}${data.older ? "+" : ""}` : `${rows.length}${data.older ? "+" : ""}`;

  function openSheet(edit: CallBackView | null) {
    setError(null);
    const t = new Date();
    setSheet({
      open: true,
      edit,
      key: nonce(),
      atWall: edit ? wallOfInstant(new Date(edit.at)) : wallOfInstant(t),
      remindWall: edit?.remindAt ? wallOfInstant(new Date(edit.remindAt)) : defaultRemindWall(t),
    });
  }

  function archive(row: CallBackView) {
    setSheet((s) => (s ? { ...s, open: false } : s));
    setError(null);
    setHidden((h) => new Set(h).add(row.id));
    void archiveCallBack(row.id, { refresh: true })
      .catch(() => ({ ok: false as const, error: UNREACHABLE }))
      .then((res) => {
        if (!res.ok) {
          setHidden((h) => {
            const n = new Set(h);
            n.delete(row.id);
            return n;
          });
          setError(res.error);
          return;
        }
        pushToast({
          key: `cb-archive-${row.id}`,
          title: "Call back archived",
          body: [ACTION_WORDS[row.action], whenLabel(row.at, now), briefOf(row.tags)].filter(Boolean).join(" · "),
          holdMs: 10_000,
          action: {
            label: "Undo",
            onAction: () => {
              void restoreCallBack(row.id, { refresh: true })
                .catch(() => ({ ok: false as const, error: UNREACHABLE }))
                .then((r) => {
                  if (!r.ok) {
                    setError(r.error);
                    return;
                  }
                  setHidden((h) => {
                    const n = new Set(h);
                    n.delete(row.id);
                    return n;
                  });
                  router.refresh();
                });
            },
          },
        });
      });
  }

  function done(row: CallBackView) {
    setError(null);
    setBusy(row.id);
    void clearCallBackReminder(row.id, { refresh: true })
      .catch(() => ({ ok: false as const, error: UNREACHABLE }))
      .then((res) => {
        setBusy(null);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const snapshot = res.value;
        pushToast({
          key: `cb-done-${row.id}`,
          title: "Reminder done",
          body: "The call back stays in the log.",
          holdMs: 10_000,
          action: {
            label: "Undo",
            onAction: () => {
              void restoreCallBackReminder(row.id, snapshot, { refresh: true })
                .catch(() => ({ ok: false as const, error: UNREACHABLE }))
                .then((r) => {
                  if (!r.ok) setError(r.error);
                });
            },
          },
        });
      });
  }

  return (
    <section className="cb-sec" aria-labelledby={CALLBACKS_HEADING_ID} data-board={data.boardId}>
      <SectionHeader id={CALLBACKS_HEADING_ID} title="Call backs" aside={aside} />
      <div className="card cb-box">
        <div className="cb-add">
          <p className="t-meta">When a call happened, how, a few tags, and what to do next.</p>
          <Button variant="secondary" icon="plus" onClick={() => openSheet(null)} aria-haspopup="dialog">
            Add a call back
          </Button>
        </div>
        {(missing || askedMissing) && (
          <p className="cb-note" role="status">
            {MISSING_LINE}
          </p>
        )}
        {error && (
          <p className="cb-note" role="alert">
            {error}
          </p>
        )}
        {rows.length === 0 ? (
          <p className="cb-empty t-meta">No call backs yet. Log one after a call; a reminder can bring it back.</p>
        ) : (
          <ul className="cb-list" aria-label="Call backs, newest first">
            {visible.map((row) => (
              <CallBackCard key={row.id} row={row} now={now} highlighted={highlight === row.id} busy={busy === row.id} onEdit={() => openSheet(row)} onDone={() => done(row)} />
            ))}
          </ul>
        )}
        {(rest > 0 || (data.older && rest === 0 && rows.length >= CALLBACK_LOAD_MAX)) && (
          <div className="cb-more">
            {rest > 0 && (
              <Button variant="quiet" onClick={() => setShown((n) => n + CALLBACK_SHOWN)}>
                Show {Math.min(rest, CALLBACK_SHOWN)} more
              </Button>
            )}
            {rest === 0 && data.older && <p className="t-meta">Older call backs are kept; the newest {CALLBACK_LOAD_MAX} show here.</p>}
          </div>
        )}
      </div>
      {sheet && (
        <CallBackSheet
          state={sheet}
          boardId={data.boardId}
          recentTags={data.recentTags}
          crmOn={data.crmOn}
          customers={data.customers}
          onClose={() => setSheet((s) => (s ? { ...s, open: false } : s))}
          onArchive={archive}
        />
      )}
    </section>
  );
}

function CallBackCard({
  row,
  now,
  highlighted,
  busy,
  onEdit,
  onDone,
}: {
  row: CallBackView;
  now: Date;
  highlighted: boolean;
  busy: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const when = whenLabel(row.at, now);
  const state = reminderStateOf(row, now);
  const open = reminderOpen({ remindAt: row.remindAt, task: row.task }, now);
  const stateWord = state === "sent" ? "sent" : state === "due" ? "due" : null;
  return (
    <li id={callBackAnchorId(row.id)} className="cb-card" data-highlight={highlighted ? "1" : undefined} tabIndex={-1} aria-label={`${ACTION_WORDS[row.action]}, ${when}`}>
      <div className="cb-head">
        <span className="cb-glyph">
          <ActionGlyph action={row.action} />
        </span>
        <span className="cb-what">
          <b>{ACTION_WORDS[row.action]}</b>
          <time dateTime={row.at}>{when}</time>
        </span>
        <button type="button" className="cb-edit" onClick={onEdit} aria-haspopup="dialog" aria-label={`Edit the call back: ${ACTION_WORDS[row.action]}, ${when}`}>
          Edit
        </button>
      </div>
      {row.tags.length > 0 && (
        <ul className="cb-tags" aria-label="Brief">
          {row.tags.map((t) => (
            <li key={t}>
              <Chip>{t}</Chip>
            </li>
          ))}
        </ul>
      )}
      {row.customer && (
        <p className="cb-line">
          <span className="cb-k">Customer</span>
          <span>{row.customer.name}</span>
          <span className="t-mono">#{row.customer.number}</span>
        </p>
      )}
      {row.task && (
        <p className="cb-line" data-done={row.task.done ? "1" : undefined}>
          <span className="cb-k">Task</span>
          <span className="cb-task">{row.task.title}</span>
          <span className="cb-state">· {row.task.done ? "done" : "on the board"}</span>
        </p>
      )}
      {row.remindAt && (
        <div className="cb-remind">
          <span className="cb-remind-t">
            <Icon name="bell" />
            <span>
              <span className="sr-only">Reminder: </span>
              {whenLabel(row.remindAt, now)} · {ACTION_WORDS[row.remindAction ?? row.action]}
            </span>
          </span>
          {/* Colour reports kept / owed / held only: 'due' is ink plus a clock, 'sent' ink plus a tick. */}
          {stateWord && <Chip icon={state === "due" ? "clock" : "check"}>{stateWord}</Chip>}
          {open && (
            <button type="button" className="cb-act" onClick={onDone} disabled={busy} aria-label={`Done: clear the reminder of ${when}`}>
              {busy ? "Saving…" : "Done"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
