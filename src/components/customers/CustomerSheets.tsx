"use client";

/**
 * The customer list's sheets (customers.ts and crm.ts hold the rules): a customer's
 * details (add and edit; since Phase 2 also their status, email, company,
 * address and tags), an info (add and edit: the detail, when it was
 * recorded), an interaction (add and edit: when, what happened, a brief) and
 * a check (Phase 2: Rate, Home, Work and Record at).
 * A customer's scheduled tasks use the work frame's one scheduled task sheet
 * (components/work/ScheduledTaskSheet.tsx). Each checks its fields with the same clean* the server
 * uses, says what is wrong under the field, and hands a clean input to its
 * caller's save, which answers an error line or null. A parent remounts a
 * sheet (its `key`) each time it opens, so the fields start from `initial`.
 */
import { useId, useState, useTransition, type ReactNode } from "react";
import {
  CHECK_FIELDS,
  CHECK_FIELD_MAX,
  CHECK_LABELS,
  CUSTOMER_ADDRESS_MAX,
  CUSTOMER_COMPANY_MAX,
  CUSTOMER_EMAIL_MAX,
  CUSTOMER_STATUSES,
  STATUS_LABEL,
  cleanAddress,
  cleanCheckInput,
  cleanCompany,
  cleanEmail,
  cleanTags,
  type CheckField,
  type CustomerStatus,
} from "@/lib/crm";
import {
  CUSTOMER_ACTIONS,
  CUSTOMER_ACTION_LABEL,
  CUSTOMER_INFO_MAX,
  CUSTOMER_NAME_MAX,
  CUSTOMER_NICKNAME_MAX,
  CUSTOMER_NUMBER_MAX,
  CUSTOMER_NUMBER_TAKEN,
  CUSTOMER_PHONE_MAX,
  INTERACTION_BRIEF_MAX,
  RECORDED_AHEAD_MS,
  RECORDED_FUTURE,
  WHEN_BAD,
  cleanAction,
  cleanBrief,
  cleanCustomerName,
  cleanCustomerNumber,
  cleanInfoDetail,
  cleanNickname,
  cleanPhone,
  instantOfLocalInput,
  numberUsed,
  type CustomerAction,
} from "@/lib/customers";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ActionMark } from "@/components/work/ChannelGlyph";
import { TagField } from "./TagField";

export const UNREACHABLE = "Couldn't reach the server. Check the connection and try again.";

const count = (s: string) => [...s].length;

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

// ── A customer ─────────────────────────────────────────────────────────────

export interface CustomerFormValue {
  number: string;
  name: string;
  nickname: string;
  phone: string;
  /** Phase 2 (crm.ts). */
  status: CustomerStatus;
  email: string;
  company: string;
  address: string;
  tags: string[];
}

/** What the form hands its caller's save: every field cleaned. */
export interface CustomerFormOutput {
  number: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  status: CustomerStatus;
  email: string | null;
  company: string | null;
  address: string | null;
  tags: string[];
}

type CustomerField = "number" | "name" | "nickname" | "phone" | "email" | "company" | "address" | "tags";

export function CustomerFormSheet({
  open,
  onClose,
  title,
  description,
  initial,
  numericId,
  others,
  selfId,
  submitLabel,
  onSave,
  children,
  recentTags = [],
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  initial: CustomerFormValue;
  /** The tab's IDs are numbers: the ID field gets the numeric keyboard. */
  numericId: boolean;
  /** The tab's kept customers, when known: a taken ID is said before the save. */
  others?: readonly { id: string; number: string }[];
  /** The customer being edited (their own ID is not "taken"). */
  selfId?: string;
  submitLabel: string;
  onSave: (value: CustomerFormOutput) => Promise<string | null>;
  /** More below the form (the edit sheet's Archive). */
  children?: ReactNode;
  /** The tab's recent tags (crm.ts recentTagsOf), offered as tags are typed. */
  recentTags?: readonly string[];
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [tagTyped, setTagTyped] = useState("");
  const [errors, setErrors] = useState<Partial<Record<CustomerField | "form", string>>>({});
  const [pending, start] = useTransition();
  const set = (k: Exclude<CustomerField, "tags">) => (value: string) => {
    setV((x) => ({ ...x, [k]: value }));
    if (errors[k] || errors.form) setErrors((e) => ({ ...e, [k]: undefined, form: undefined }));
  };

  function save() {
    const number = cleanCustomerNumber(v.number);
    const name = cleanCustomerName(v.name);
    const nickname = cleanNickname(v.nickname);
    const phone = cleanPhone(v.phone);
    const email = cleanEmail(v.email);
    const company = cleanCompany(v.company);
    const address = cleanAddress(v.address);
    // Whatever is still typed in the tag field is a tag too.
    const tags = cleanTags(tagTyped.trim() ? [...v.tags, tagTyped] : v.tags);
    const next: typeof errors = {};
    if (!number.ok) next.number = number.error;
    else if (others && numberUsed(others, number.value, selfId)) next.number = CUSTOMER_NUMBER_TAKEN;
    if (!name.ok) next.name = name.error;
    if (!nickname.ok) next.nickname = nickname.error;
    if (!phone.ok) next.phone = phone.error;
    if (!email.ok) next.email = email.error;
    if (!company.ok) next.company = company.error;
    if (!address.ok) next.address = address.error;
    if (!tags.ok) next.tags = tags.error;
    if (!number.ok || !name.ok || !nickname.ok || !phone.ok || !email.ok || !company.ok || !address.ok || !tags.ok || Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    start(async () => {
      let error: string | null;
      try {
        error = await onSave({
          number: number.value,
          name: name.value,
          nickname: nickname.value,
          phone: phone.value,
          status: v.status,
          email: email.value,
          company: company.value,
          address: address.value,
          tags: tags.value,
        });
      } catch {
        error = UNREACHABLE;
      }
      if (error) setErrors(error === CUSTOMER_NUMBER_TAKEN ? { number: error } : { form: error });
      else {
        setV((x) => ({ ...x, tags: tags.value }));
        setTagTyped("");
      }
    });
  }

  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={title} description={description}>
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field id={`${id}-num`} label="Customer ID" error={errors.number}>
          <input
            id={`${id}-num`}
            className="crm-input"
            value={v.number}
            onChange={(e) => set("number")(e.target.value)}
            inputMode={numericId ? "numeric" : "text"}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={CUSTOMER_NUMBER_MAX + 8}
            data-autofocus
            {...invalid(errors.number, `${id}-num`)}
          />
        </Field>
        <Field id={`${id}-name`} label="Name" error={errors.name}>
          <input id={`${id}-name`} className="crm-input" value={v.name} onChange={(e) => set("name")(e.target.value)} autoComplete="off" maxLength={CUSTOMER_NAME_MAX + 8} {...invalid(errors.name, `${id}-name`)} />
        </Field>
        <fieldset className="crm-chips">
          <legend>Status</legend>
          {CUSTOMER_STATUSES.map((s) => (
            <label key={s} className="crm-chip crm-chip-plain">
              <input type="radio" name={`${id}-status`} value={s} checked={v.status === s} onChange={() => setV((x) => ({ ...x, status: s }))} />
              {STATUS_LABEL[s]}
            </label>
          ))}
        </fieldset>
        <Field id={`${id}-nick`} label="Nickname" aside="optional" error={errors.nickname}>
          <input id={`${id}-nick`} className="crm-input" value={v.nickname} onChange={(e) => set("nickname")(e.target.value)} autoComplete="off" maxLength={CUSTOMER_NICKNAME_MAX + 8} {...invalid(errors.nickname, `${id}-nick`)} />
        </Field>
        <Field id={`${id}-phone`} label="Phone" aside="optional" error={errors.phone}>
          <input
            id={`${id}-phone`}
            className="crm-input"
            type="tel"
            inputMode="tel"
            value={v.phone}
            onChange={(e) => set("phone")(e.target.value)}
            autoComplete="off"
            maxLength={CUSTOMER_PHONE_MAX + 8}
            {...invalid(errors.phone, `${id}-phone`)}
          />
        </Field>
        <Field id={`${id}-email`} label="Email" aside="optional" error={errors.email}>
          <input
            id={`${id}-email`}
            className="crm-input"
            type="email"
            inputMode="email"
            value={v.email}
            onChange={(e) => set("email")(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            maxLength={CUSTOMER_EMAIL_MAX + 8}
            {...invalid(errors.email, `${id}-email`)}
          />
        </Field>
        <Field id={`${id}-company`} label="Company" aside="optional" error={errors.company}>
          <input id={`${id}-company`} className="crm-input" value={v.company} onChange={(e) => set("company")(e.target.value)} autoComplete="off" maxLength={CUSTOMER_COMPANY_MAX + 8} {...invalid(errors.company, `${id}-company`)} />
        </Field>
        <Field id={`${id}-address`} label="Address" aside="optional" error={errors.address}>
          <textarea
            id={`${id}-address`}
            className="crm-input crm-input-short"
            value={v.address}
            rows={2}
            onChange={(e) => set("address")(e.target.value)}
            autoComplete="off"
            maxLength={CUSTOMER_ADDRESS_MAX + 20}
            {...invalid(errors.address, `${id}-address`)}
          />
        </Field>
        <TagField
          id={`${id}-tags`}
          tags={v.tags}
          typed={tagTyped}
          recent={recentTags}
          error={errors.tags}
          onTags={(tags) => {
            setV((x) => ({ ...x, tags }));
            if (errors.tags || errors.form) setErrors((e) => ({ ...e, tags: undefined, form: undefined }));
          }}
          onTyped={setTagTyped}
          onError={(error) => setErrors((e) => ({ ...e, tags: error ?? undefined }))}
        />
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
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
      {children}
    </Sheet>
  );
}

// ── An info ────────────────────────────────────────────────────────────────

export interface InfoFormValue {
  detail: string;
  /** A datetime-local value in the user's zone. */
  when: string;
}

export function InfoSheet({
  open,
  onClose,
  editing,
  initial,
  onSave,
  onArchive,
}: {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  initial: InfoFormValue;
  /** recordedAt is left out while the time is as the sheet opened it: now on an add (the server's), kept on an edit. */
  onSave: (value: { detail: string; recordedAt?: string }) => Promise<string | null>;
  /** Edit only: archive the info (the page offers Undo). */
  onArchive?: () => Promise<string | null>;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<"detail" | "when" | "form", string>>>({});
  const [pending, start] = useTransition();

  function save() {
    const detail = cleanInfoDetail(v.detail);
    const untouched = v.when === initial.when;
    const at = instantOfLocalInput(v.when);
    const ahead = !untouched && at !== null && at.getTime() > Date.now() + RECORDED_AHEAD_MS;
    if (!detail.ok || !at || ahead) {
      setErrors({ detail: detail.ok ? undefined : detail.error, when: !at ? WHEN_BAD : ahead ? RECORDED_FUTURE : undefined });
      return;
    }
    start(async () => {
      let error: string | null;
      try {
        error = await onSave(untouched ? { detail: detail.value } : { detail: detail.value, recordedAt: at.toISOString() });
      } catch {
        error = UNREACHABLE;
      }
      if (error) setErrors(error === RECORDED_FUTURE ? { when: error } : { form: error });
    });
  }

  function archive() {
    if (!onArchive) return;
    start(async () => {
      let error: string | null;
      try {
        error = await onArchive();
      } catch {
        error = UNREACHABLE;
      }
      if (error) setErrors({ form: error });
    });
  }

  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={editing ? "Edit info" : "Add info"} description="What you know about them, and when it was recorded.">
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field id={`${id}-detail`} label="Info" aside={`${count(v.detail.trim())}/${CUSTOMER_INFO_MAX}`} error={errors.detail}>
          <textarea
            id={`${id}-detail`}
            className="crm-input"
            value={v.detail}
            rows={5}
            onChange={(e) => {
              setV((x) => ({ ...x, detail: e.target.value }));
              if (errors.detail || errors.form) setErrors((er) => ({ ...er, detail: undefined, form: undefined }));
            }}
            maxLength={CUSTOMER_INFO_MAX + 20}
            data-autofocus
            {...invalid(errors.detail, `${id}-detail`)}
          />
        </Field>
        <Field id={`${id}-when`} label="Recorded at" error={errors.when}>
          <input
            id={`${id}-when`}
            className="crm-input"
            type="datetime-local"
            value={v.when}
            onChange={(e) => {
              setV((x) => ({ ...x, when: e.target.value }));
              if (errors.when || errors.form) setErrors((er) => ({ ...er, when: undefined, form: undefined }));
            }}
            {...invalid(errors.when, `${id}-when`)}
          />
        </Field>
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add info"}
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
          <p>Archive takes the info off their page. You can undo right after.</p>
          <div className="crm-form-actions">
            <Button variant="secondary" onClick={archive} disabled={pending}>
              Archive info
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── An interaction ─────────────────────────────────────────────────────────

export interface InteractionFormValue {
  /** A datetime-local value in the user's zone. */
  when: string;
  action: CustomerAction | null;
  brief: string;
}

export function InteractionSheet({
  open,
  onClose,
  editing,
  initial,
  onSave,
  onArchive,
}: {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  initial: InteractionFormValue;
  onSave: (value: { at: string; action: CustomerAction; brief: string }) => Promise<string | null>;
  onArchive?: () => Promise<string | null>;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<"when" | "action" | "brief" | "form", string>>>({});
  const [pending, start] = useTransition();

  function save() {
    const at = instantOfLocalInput(v.when);
    const action = cleanAction(v.action);
    const brief = cleanBrief(v.brief);
    if (!at || !action.ok || !brief.ok) {
      setErrors({ when: at ? undefined : WHEN_BAD, action: action.ok ? undefined : action.error, brief: brief.ok ? undefined : brief.error });
      return;
    }
    start(async () => {
      let error: string | null;
      try {
        error = await onSave({ at: at.toISOString(), action: action.value, brief: brief.value });
      } catch {
        error = UNREACHABLE;
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
        error = UNREACHABLE;
      }
      if (error) setErrors({ form: error });
    });
  }

  const briefLen = count(v.brief.trim());
  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={editing ? "Edit entry" : "Log an interaction"} description="Their log keeps the newest first.">
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field id={`${id}-when`} label="When" error={errors.when}>
          <input
            id={`${id}-when`}
            className="crm-input"
            type="datetime-local"
            value={v.when}
            onChange={(e) => {
              setV((x) => ({ ...x, when: e.target.value }));
              if (errors.when) setErrors((er) => ({ ...er, when: undefined }));
            }}
            {...invalid(errors.when, `${id}-when`)}
          />
        </Field>
        <fieldset className="crm-chips" aria-describedby={errors.action ? `${id}-act-err` : undefined}>
          <legend>What happened</legend>
          {CUSTOMER_ACTIONS.map((a) => (
            <label key={a} className="crm-chip">
              <input
                type="radio"
                name={`${id}-action`}
                value={a}
                checked={v.action === a}
                onChange={() => {
                  setV((x) => ({ ...x, action: a }));
                  if (errors.action) setErrors((er) => ({ ...er, action: undefined }));
                }}
              />
              <ActionMark action={a} />
              {CUSTOMER_ACTION_LABEL[a]}
            </label>
          ))}
        </fieldset>
        {errors.action && (
          <p className="crm-field-err" id={`${id}-act-err`} role="alert">
            {errors.action}
          </p>
        )}
        <Field id={`${id}-brief`} label="Brief" aside={`${briefLen}/${INTERACTION_BRIEF_MAX}`} error={errors.brief}>
          <textarea
            id={`${id}-brief`}
            className="crm-input"
            value={v.brief}
            rows={3}
            onChange={(e) => {
              setV((x) => ({ ...x, brief: e.target.value }));
              if (errors.brief) setErrors((er) => ({ ...er, brief: undefined }));
            }}
            maxLength={INTERACTION_BRIEF_MAX + 20}
            {...invalid(errors.brief, `${id}-brief`)}
          />
        </Field>
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add to log"}
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
          <p>Archive takes the entry out of the log. You can undo right after.</p>
          <div className="crm-form-actions">
            <Button variant="secondary" onClick={archive} disabled={pending}>
              Archive entry
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ── A check ────────────────────────────────────────────────────────────────

export interface CheckFormValue {
  rate: string;
  home: string;
  work: string;
  /** 'YYYY-MM-DD'. */
  recordedAt: string;
}

/**
 * A check (Phase 2, crm.ts): Rate, Home and Work (each one line, optional, at least one) and Record at (a day: today
 * unless picked, never after it). Edit adds Archive (the caller offers Undo).
 */
export function CheckSheet({
  open,
  onClose,
  editing,
  initial,
  today,
  onSave,
  onArchive,
}: {
  open: boolean;
  onClose: () => void;
  editing: boolean;
  initial: CheckFormValue;
  /** Today's life day: Record at's default and its latest. */
  today: string;
  onSave: (value: { rate: string | null; home: string | null; work: string | null; recordedAt: string }) => Promise<string | null>;
  onArchive?: () => Promise<string | null>;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof CheckFormValue) => (value: string) => {
    setV((x) => ({ ...x, [k]: value }));
    if (error) setError(null);
  };

  function save() {
    const clean = cleanCheckInput(v, today);
    if (!clean.ok) {
      setError(clean.error);
      return;
    }
    start(async () => {
      let e: string | null;
      try {
        e = await onSave(clean.value);
      } catch {
        e = UNREACHABLE;
      }
      if (e) setError(e);
    });
  }

  function archive() {
    if (!onArchive) return;
    start(async () => {
      let e: string | null;
      try {
        e = await onArchive();
      } catch {
        e = UNREACHABLE;
      }
      if (e) setError(e);
    });
  }

  const label = (f: CheckField) => CHECK_LABELS[f];
  return (
    <Sheet open={open} onClose={() => !pending && onClose()} title={editing ? "Edit check" : "Add check"} description="Rate, Home and Work: fill in at least one.">
      <form
        className="crm-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {CHECK_FIELDS.map((f, i) => (
          <Field key={f} id={`${id}-${f}`} label={label(f)} aside={`${count(v[f].trim())}/${CHECK_FIELD_MAX}`}>
            <input
              id={`${id}-${f}`}
              className="crm-input"
              value={v[f]}
              onChange={(e) => set(f)(e.target.value)}
              autoComplete="off"
              maxLength={CHECK_FIELD_MAX + 8}
              data-autofocus={i === 0 ? "" : undefined}
            />
          </Field>
        ))}
        <Field id={`${id}-at`} label={CHECK_LABELS.recordedAt}>
          <input id={`${id}-at`} className="crm-input" type="date" value={v.recordedAt} min="2000-01-01" max={today} onChange={(e) => set("recordedAt")(e.target.value)} />
        </Field>
        <div className="crm-form-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save" : "Add check"}
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
      {editing && onArchive && (
        <div className="crm-danger" style={{ marginTop: 14 }}>
          <p>Archive takes the check off their page. You can undo right after.</p>
          <div className="crm-form-actions">
            <Button variant="secondary" onClick={archive} disabled={pending}>
              Archive check
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
