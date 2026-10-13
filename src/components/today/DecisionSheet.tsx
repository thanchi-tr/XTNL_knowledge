"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import {
  DEFER_MAX_DAYS,
  REASON_MAX,
  REASON_TAGS,
  REASON_TAG_LABEL,
  abortLineOf,
  cleanReason,
  clockOf,
  deferLineOf,
  deferNudgeOf,
  deferPicksOf,
  deferTimeRefusalOf,
  localInputOf,
  parseLocalDateTime,
  untilLabelOf,
  type AbortScope,
  type DeferShape,
  type ReasonTag,
} from "@/lib/task-decisions";

/** What the sheet sends: the reason (and its chip), and the return (Defer) or the scope (Abort). */
export interface DecisionSubmit {
  reason: string;
  reasonTag: ReasonTag | null;
  /** Defer: when it comes back (ISO). */
  until?: string;
  /** Abort: just this time, or for good (a one-off is always for good). */
  scope?: AbortScope;
}

/** The task the sheet is open on, as the board knows it. */
export interface DecisionTarget {
  title: string;
  /** task-decisions.ts deferShapeOf: must, repeating, deadline or one-off. */
  shape: DeferShape;
  recurring: boolean;
  /** A must whose day counts (the personal Board's; a work tab's must has no stakes). */
  must: boolean;
  /** A work tab's task: no XP and no streak words. */
  work: boolean;
  /** A deadline's own label ('by Fri', 'late 2d'), for the defer's line. */
  dueLabel: string | null;
  /** Defers so far (not undone): the nudge from the third. */
  defers: number;
  /** A must's archive waits seven days once Duty is live: the day it would leave ('Thu 8 Oct'); null when immediate. */
  endsOn: string | null;
}

interface Props {
  open: boolean;
  mode: "defer" | "abort";
  /** Changes with each opening, so the form starts fresh. */
  formKey: number;
  target: DecisionTarget | null;
  /** The board's clock (server time) when the sheet opened: the quick picks are relative to it. */
  nowMs: number;
  busy: boolean;
  error: string | null;
  onSubmit: (v: DecisionSubmit) => void;
  onClose: () => void;
}

/**
 * Defer… and Abort… (task-decisions.ts), one sheet: the reason chips (one tap fills the reason)
 * and a short field (required), then — Defer — when it comes back (the quick picks relative to
 * now in the life zone, or a date and time), or — Abort on a repeating task — just this time or
 * for good. It says before the tap what the choice does (a must's day still counts as not kept;
 * a must's series ends after seven days). Every target is 44 px or more.
 */
export function DecisionSheet({ open, mode, formKey, target, nowMs, busy, error, onSubmit, onClose }: Props) {
  const title = target ? `${mode === "defer" ? "Defer" : "Abort"} “${target.title}”` : mode === "defer" ? "Defer" : "Abort";
  return (
    <Sheet open={open} onClose={onClose} title={title} description={mode === "defer" ? "Put it off, with a reason. Nothing is paid or taken." : "Drop it, with a reason. Nothing is paid or taken."}>
      {target && <DecisionForm key={formKey} mode={mode} target={target} nowMs={nowMs} busy={busy} error={error} onSubmit={onSubmit} />}
    </Sheet>
  );
}

type PickChoice = string | "custom";

/** The sheet's body, keyed per opening (exported for the checks: the Sheet portals, which a static render cannot). */
export function DecisionForm({ mode, target, nowMs, busy, error, onSubmit }: { mode: "defer" | "abort"; target: DecisionTarget; nowMs: number; busy: boolean; error: string | null; onSubmit: (v: DecisionSubmit) => void }) {
  const id = useId();
  const [tag, setTag] = useState<ReasonTag | null>(null);
  const [text, setText] = useState("");
  const picks = useMemo(() => deferPicksOf(nowMs, { must: target.must }), [nowMs, target.must]);
  const firstPick = picks.find((p) => p.id === "tomorrow")?.at ?? picks[0]?.at ?? null;
  const [pick, setPick] = useState<PickChoice>(firstPick ?? "custom");
  const [custom, setCustom] = useState(() => localInputOf(firstPick ?? nowMs + 86_400_000));
  const [scope, setScope] = useState<AbortScope>(target.recurring ? "ONCE" : "SERIES");
  const [local, setLocal] = useState<string | null>(null);
  const shown = local ?? error;

  const until = pick === "custom" ? parseLocalDateTime(custom) : new Date(pick);
  const untilMs = until ? until.getTime() : null;
  // From the third defer on (the drawer says it too): break it into steps, or abort it.
  const nudge = mode === "defer" ? deferNudgeOf(target.defers) : null;
  // A repeating task's abort says it on each of its two choices instead.
  const line =
    mode === "defer"
      ? deferLineOf(target.shape, { recurring: target.recurring, dueLabel: target.dueLabel, work: target.work })
      : target.recurring
        ? null
        : abortLineOf({ recurring: false, must: target.must, scope: "SERIES", endsOn: target.endsOn, work: target.work });

  function chooseTag(t: ReasonTag) {
    const next = tag === t ? null : t;
    // One tap fills the reason: the field takes the chip's words unless something else was typed.
    const chipWords = new Set<string>(REASON_TAGS.map((x) => REASON_TAG_LABEL[x]));
    if (!text.trim() || chipWords.has(text.trim())) setText(next ? REASON_TAG_LABEL[next] : "");
    setTag(next);
    setLocal(null);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const reason = cleanReason(text, tag);
    if (!reason.ok) return setLocal(reason.error);
    if (mode === "defer") {
      const bad = deferTimeRefusalOf(untilMs, nowMs, { must: target.must });
      if (bad || !until) return setLocal(bad ?? "Pick when it comes back.");
      setLocal(null);
      onSubmit({ reason: reason.reason, reasonTag: reason.reasonTag, until: until.toISOString() });
      return;
    }
    setLocal(null);
    onSubmit({ reason: reason.reason, reasonTag: reason.reasonTag, scope: target.recurring ? scope : "SERIES" });
  }

  const back = untilMs != null && Number.isFinite(untilMs) ? untilLabelOf(untilMs, nowMs) : null;
  const action =
    mode === "defer" ? (back ? `Defer to ${back}` : "Defer") : !target.recurring ? "Abort it" : scope === "ONCE" ? "Abort just this time" : "Stop it for good";

  return (
    <form className="dec-form" onSubmit={submit} noValidate>
      {line && <p className="dec-note">{line}</p>}
      {nudge && (
        <p className="dec-nudge" role="note">
          {nudge}
        </p>
      )}

      <fieldset className="dec-sec">
        <legend className="t-eyebrow">Why</legend>
        <div className="dec-chips">
          {REASON_TAGS.map((t) => (
            <button key={t} type="button" className="dec-chip" aria-pressed={tag === t} onClick={() => chooseTag(t)} disabled={busy}>
              {REASON_TAG_LABEL[t]}
            </button>
          ))}
        </div>
        <label htmlFor={`${id}-r`} className="sr-only">
          The reason, in a few words
        </label>
        <input
          id={`${id}-r`}
          className="today-input dec-input"
          value={text}
          maxLength={REASON_MAX}
          placeholder="Why, in a few words"
          onChange={(e) => {
            setText(e.target.value);
            setLocal(null);
          }}
          aria-invalid={shown ? true : undefined}
          aria-describedby={shown ? `${id}-e` : undefined}
          disabled={busy}
          required
        />
      </fieldset>

      {mode === "defer" && (
        <fieldset className="dec-sec">
          <legend className="t-eyebrow">Back</legend>
          <div className="dec-chips" role="radiogroup" aria-label="When it comes back">
            {picks.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={pick === p.at}
                className="dec-chip"
                onClick={() => {
                  setPick(p.at);
                  setLocal(null);
                }}
                disabled={busy}
              >
                {p.id === "hour" ? `${p.label} · ${clockOf(p.at)}` : p.label}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={pick === "custom"}
              className="dec-chip"
              onClick={() => {
                setPick("custom");
                setLocal(null);
              }}
              disabled={busy}
            >
              Pick a date &amp; time
            </button>
          </div>
          {pick === "custom" && (
            <>
              <label htmlFor={`${id}-d`} className="sr-only">
                Date and time it comes back
              </label>
              <input
                id={`${id}-d`}
                className="today-input dec-input"
                type="datetime-local"
                min={localInputOf(nowMs + 60_000)}
                max={localInputOf(nowMs + DEFER_MAX_DAYS * 86_400_000)}
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  setLocal(null);
                }}
                disabled={busy}
              />
            </>
          )}
          <p className="dec-note" aria-live="polite">
            {back ? `Back ${back}.` : "Pick when it comes back."}
            {target.must ? " A must deferred leaves today: today counts as not kept." : ""}
          </p>
        </fieldset>
      )}

      {mode === "abort" && target.recurring && (
        <fieldset className="dec-sec">
          <legend className="t-eyebrow">Abort</legend>
          <div className="dec-scope" role="radiogroup" aria-label="Just this time, or for good">
            <button type="button" role="radio" aria-checked={scope === "ONCE"} className="dec-opt" onClick={() => setScope("ONCE")} disabled={busy}>
              <b>Just this time</b>
              <span>{abortLineOf({ recurring: true, must: target.must, scope: "ONCE", work: target.work })}</span>
            </button>
            <button type="button" role="radio" aria-checked={scope === "SERIES"} className="dec-opt" onClick={() => setScope("SERIES")} disabled={busy}>
              <b>Stop it for good</b>
              <span>{abortLineOf({ recurring: true, must: target.must, scope: "SERIES", endsOn: target.endsOn, work: target.work })}</span>
            </button>
          </div>
        </fieldset>
      )}

      {shown && (
        <p id={`${id}-e`} className="t-error" role="alert">
          {shown}
        </p>
      )}
      <Button type="submit" variant={mode === "abort" && (scope === "SERIES" || !target.recurring) ? "danger" : "primary"} size="lg" block disabled={busy}>
        {busy ? "Saving…" : action}
      </Button>
    </form>
  );
}
