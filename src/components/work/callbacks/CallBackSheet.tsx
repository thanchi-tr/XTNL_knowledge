"use client";

/**
 * Add or edit a call back (CallBacksSection opens it; callbacks.ts holds every rule the server holds too):
 *
 *   When            datetime-local, now by default (the user's zone, LIFE_TZ)
 *   How             Phone call | In person (two 44 px toggles)
 *   Brief           tags: Enter or a comma adds one, a chip removes itself, this tab's recent tags are offered as
 *                   you type (lowercase, ≤ TAG_MAX_CHARS each, ≤ TAG_MAX)
 *   Customer ID     only on a tab whose customer list is on: matched among the tab's customers, the name shown
 *   Call back task  empty by default; filled, it becomes a task on this tab's board (planned on the reminder's
 *                   day); cleared on an edit, the call back lets go of it (the task stays on the board)
 *   Reminder        off by default; on: when (tomorrow 09:00 by default) and how to call back. Moving it
 *                   arms it again (remindSentAt cleared on the server)
 *
 * Save checks the fields here first (cleanCallBackInput, the server's own rules), then saveCallBack refreshes
 * the tab. An edit's footer also archives (with an Undo in the dock).
 */
import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { saveCallBack } from "@/app/actions/callbacks";
import {
  ACTION_WORDS,
  CALLBACK_ACTIONS,
  CALLBACK_TASK_MAX,
  CUSTOMER_ID_MAX,
  TAG_MAX,
  TAG_MAX_CHARS,
  cleanCallBackInput,
  cleanTags,
  instantOfWall,
  matchCustomer,
  normalizeTag,
  tagSuggestionsOf,
  type CallBackAction,
  type CallBackInput,
  type CallBackView,
  type CustomerRef,
} from "@/lib/callbacks";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Tabs";
import { ActionGlyph } from "./ActionGlyph";

/** One opening of the sheet: the call back it edits (null: a new one), its save key and the starting times. */
export interface CallBackSheetState {
  open: boolean;
  edit: CallBackView | null;
  /** This opening's nonce: the form's React key and the save's task key (a retry never adds a second task). */
  key: string;
  /** The When field's start (datetime-local, the user's zone). */
  atWall: string;
  /** The reminder's start when it is turned on. */
  remindWall: string;
}

const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

export function CallBackSheet({
  state,
  boardId,
  recentTags,
  crmOn,
  customers,
  onClose,
  onArchive,
}: {
  state: CallBackSheetState;
  boardId: string;
  recentTags: string[];
  crmOn: boolean;
  customers: CustomerRef[];
  onClose: () => void;
  onArchive: (row: CallBackView) => void;
}) {
  const formId = useId();
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      open={state.open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={state.edit ? "Edit call back" : "New call back"}
      description="When it happened, how, a brief in tags, and what comes next."
      footer={
        <div className="cb-foot">
          <Button variant="primary" size="lg" type="submit" form={formId} disabled={busy}>
            {busy ? "Saving…" : state.edit ? "Save" : "Add call back"}
          </Button>
          {state.edit && (
            <Button variant="quiet" onClick={() => onArchive(state.edit!)} disabled={busy}>
              Archive
            </Button>
          )}
        </div>
      }
    >
      <CallBackForm
        key={state.key}
        formId={formId}
        state={state}
        boardId={boardId}
        recentTags={recentTags}
        crmOn={crmOn}
        customers={customers}
        onBusy={setBusy}
        onSaved={onClose}
      />
    </Sheet>
  );
}

function ActionToggle({ value, onChange, label }: { value: CallBackAction; onChange: (a: CallBackAction) => void; label: string }) {
  return (
    <div className="cb-toggle" role="group" aria-label={label}>
      {CALLBACK_ACTIONS.map((a) => (
        <button key={a} type="button" className="cb-tog" aria-pressed={value === a} onClick={() => onChange(a)}>
          <ActionGlyph action={a} />
          {ACTION_WORDS[a]}
        </button>
      ))}
    </div>
  );
}

function CallBackForm({
  formId,
  state,
  boardId,
  recentTags,
  crmOn,
  customers,
  onBusy,
  onSaved,
}: {
  formId: string;
  state: CallBackSheetState;
  boardId: string;
  recentTags: string[];
  crmOn: boolean;
  customers: CustomerRef[];
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const edit = state.edit;
  const ids = useId();
  const [atWall, setAtWall] = useState(state.atWall);
  const [action, setAction] = useState<CallBackAction>(edit?.action ?? "PHONE");
  const [tags, setTags] = useState<string[]>(edit?.tags ?? []);
  const [typed, setTyped] = useState("");
  const [task, setTask] = useState(edit?.task?.title ?? "");
  const [customer, setCustomer] = useState(edit?.customer?.number ?? "");
  const [remindOn, setRemindOn] = useState(Boolean(edit?.remindAt));
  const [remindWall, setRemindWall] = useState(state.remindWall);
  const [remindAction, setRemindAction] = useState<CallBackAction>(edit?.remindAction ?? edit?.action ?? "PHONE");
  const [error, setError] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const showCustomer = crmOn || Boolean(edit?.customer);
  const matched = matchCustomer(customers, customer) ?? (edit?.customer && edit.customer.number.trim().toLowerCase() === customer.trim().toLowerCase() ? edit.customer : null);
  const suggestions = tagSuggestionsOf(recentTags, typed, tags);
  const full = tags.length >= TAG_MAX;
  /** The reminder this call back had already went out (the dispatcher stamped it). */
  const wasSent = Boolean(edit?.remindAt && edit.remindSentAt);

  /** Adds the typed words as a tag (or the tapped suggestion); says why when it cannot. */
  function addTag(raw: string): boolean {
    const t = normalizeTag(raw);
    if (!t) return true;
    if ([...t].length > TAG_MAX_CHARS) {
      setTagError(`Keep each tag to ${TAG_MAX_CHARS} characters.`);
      return false;
    }
    if (tags.includes(t)) {
      setTyped("");
      return true;
    }
    if (tags.length >= TAG_MAX) {
      setTagError(`Up to ${TAG_MAX} tags on a call back.`);
      return false;
    }
    setTags([...tags, t]);
    setTyped("");
    setTagError(null);
    return true;
  }

  function onTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(typed);
    } else if (e.key === "Backspace" && typed === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function onTagChange(v: string) {
    // A pasted 'acme, pricing' or a typed comma commits what came before it.
    if (v.includes(",")) {
      const parts = v.split(",");
      const last = parts.pop() ?? "";
      let next = [...tags];
      for (const p of parts) {
        const t = normalizeTag(p);
        if (t && !next.includes(t) && [...t].length <= TAG_MAX_CHARS && next.length < TAG_MAX) next = [...next, t];
      }
      setTags(next);
      setTyped(last);
      return;
    }
    setTyped(v);
    setTagError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError(null);
    // Whatever is still typed in the tag field is a tag too.
    const finalTags = typed.trim() ? [...tags, typed] : tags;
    const cleaned = cleanTags(finalTags);
    if (!cleaned.ok) {
      setTagError(cleaned.error);
      return;
    }
    const at = instantOfWall(atWall);
    const remindAt = remindOn ? instantOfWall(remindWall) : null;
    const input: CallBackInput = {
      at: at ? at.toISOString() : "",
      action,
      tags: cleaned.tags,
      task: task.trim(),
      remind: remindOn ? { at: remindAt ? remindAt.toISOString() : "", action: remindAction } : null,
      customer: showCustomer ? customer.trim() : "",
      key: state.key,
    };
    // The server's own rules, here first: a refusal costs no round trip.
    const local = cleanCallBackInput(input, new Date(), edit?.remindAt ? new Date(edit.remindAt) : null);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    if (showCustomer && customer.trim() && !matched) {
      setError(`No customer “${customer.trim()}” on this tab. Check the ID, or leave it empty.`);
      return;
    }
    onBusy(true);
    start(async () => {
      let res: Awaited<ReturnType<typeof saveCallBack>>;
      try {
        res = await saveCallBack(boardId, edit?.id ?? null, input, { refresh: true });
      } catch {
        res = { ok: false, error: UNREACHABLE };
      }
      onBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTags(cleaned.tags);
      setTyped("");
      onSaved();
    });
  }

  return (
    <form id={formId} className="cb-form" onSubmit={submit} noValidate>
      <div className="cb-field">
        <label className="cb-label" htmlFor={`${ids}-at`}>
          When
        </label>
        <input id={`${ids}-at`} className="cb-input" type="datetime-local" value={atWall} onChange={(e) => setAtWall(e.target.value)} required />
      </div>

      <fieldset className="cb-field">
        <legend className="cb-label">How</legend>
        <ActionToggle value={action} onChange={setAction} label="How the call happened" />
      </fieldset>

      <div className="cb-field">
        <label className="cb-label" htmlFor={`${ids}-tag`}>
          Brief
        </label>
        {tags.length > 0 && (
          <ul className="cb-chosen" aria-label="Tags on this call back">
            {tags.map((t) => (
              <li key={t}>
                <button type="button" className="cb-tag-x" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Remove the tag ${t}`}>
                  {t}
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          id={`${ids}-tag`}
          className="cb-input"
          type="text"
          value={typed}
          onChange={(e) => onTagChange(e.target.value)}
          onKeyDown={onTagKey}
          placeholder={full ? `${TAG_MAX} tags: remove one to add another` : "acme, pricing, follow up"}
          maxLength={TAG_MAX_CHARS * 3}
          autoComplete="off"
          autoCapitalize="none"
          enterKeyHint="enter"
          aria-describedby={`${ids}-tag-hint`}
          aria-invalid={tagError ? true : undefined}
        />
        {suggestions.length > 0 && !full && (
          <div className="cb-sugs" role="group" aria-label="This tab's recent tags">
            <span className="cb-k">Recent on this tab</span>
            {suggestions.map((s) => (
              <button key={s} type="button" className="cb-sug" onClick={() => addTag(s)} aria-label={`Add the tag ${s}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <p id={`${ids}-tag-hint`} className="cb-hint">
          Short tags, up to {TAG_MAX}. Enter or a comma adds one.
        </p>
        {tagError && (
          <p className="cb-err" role="alert">
            {tagError}
          </p>
        )}
      </div>

      {showCustomer && (
        <div className="cb-field">
          <label className="cb-label" htmlFor={`${ids}-cust`}>
            Customer ID <span className="cb-hint">(optional)</span>
          </label>
          <input
            id={`${ids}-cust`}
            className="cb-input"
            type="text"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            maxLength={CUSTOMER_ID_MAX}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby={`${ids}-cust-hint`}
          />
          <p id={`${ids}-cust-hint`} className={matched ? "cb-match" : "cb-hint"} aria-live="polite">
            {customer.trim() === "" ? "A customer of this tab, by their ID." : matched ? matched.name : "No customer with that ID on this tab."}
          </p>
        </div>
      )}

      <div className="cb-field">
        <label className="cb-label" htmlFor={`${ids}-task`}>
          Call back task <span className="cb-hint">(optional)</span>
        </label>
        <input
          id={`${ids}-task`}
          className="cb-input"
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          maxLength={CALLBACK_TASK_MAX}
          placeholder="send the revised quote"
          autoComplete="off"
          aria-describedby={`${ids}-task-hint`}
        />
        <p id={`${ids}-task-hint`} className="cb-hint">
          {edit?.task && !task.trim()
            ? "Cleared: the call back lets go of its task. The task stays on the board."
            : `It lands on this tab's board${remindOn ? ", planned for the reminder's day" : ""}. Work only: no XP.`}
        </p>
      </div>

      <div className="cb-field">
        <div className="cb-switch-row">
          <span className="cb-label" id={`${ids}-rem`}>
            Reminder
          </span>
          <Switch checked={remindOn} onChange={setRemindOn} label="Remind me to call back" />
        </div>
        {remindOn ? (
          <div className="cb-sub" aria-labelledby={`${ids}-rem`} role="group">
            <label className="cb-label" htmlFor={`${ids}-rat`}>
              Remind me
            </label>
            <input id={`${ids}-rat`} className="cb-input" type="datetime-local" value={remindWall} onChange={(e) => setRemindWall(e.target.value)} />
            <ActionToggle value={remindAction} onChange={setRemindAction} label="How to call back" />
            {wasSent && <p className="cb-hint">This reminder was sent. Move it to be reminded again.</p>}
            <p className="cb-hint">
              It shows in the bell when it is due, and as a notification on each device turned on in{" "}
              <Link href="/settings#notifications">Settings › Notifications</Link>.
            </p>
          </div>
        ) : (
          <p className="cb-hint">Off. Turn it on to be reminded when to call back.</p>
        )}
      </div>

      {error && (
        <p className="cb-err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
