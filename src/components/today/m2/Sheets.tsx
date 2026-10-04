"use client";

import "../today.css";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { HeldGlyph } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Tabs";

/**
 * M2 sheets (presentational): /dev/style/today renders them from fixtures;
 * Today renders RestControls, SettleFooter, FreezeOption, VacationForm and
 * CancelList from BoardData.duty (lane D). Every choice is the caller's;
 * nothing here writes. Today's own Record-yesterday sheet keeps M1's rows
 * (decision 24: no Did / Didn't toggles there).
 *
 *   RecordYesterdaySheet  Did / Didn't per open item, "Use a freeze for Wed",
 *                         "Settle Wednesday now" or it settles on its own at
 *                         Fri 04:00. Anything ticked pays at the full rate.
 *   RestControls          Plan time off: rest tomorrow (declared the day
 *                         before), sick today (1 per 14 days), vacation from
 *                         tomorrow (≤ 30 days, never backdated). Held days
 *                         bridge the streak and owe nothing.
 */

export interface YesterdayItem {
  key: string;
  title: string;
  /** "Must · Body · ≈ 4.1". */
  meta: string;
}

export type DidAnswer = "did" | "didnt" | null;

export function RecordYesterdaySheet({
  open,
  onClose,
  day,
  until,
  items,
  answers,
  onAnswer,
  freezes,
  useFreeze,
  onUseFreeze,
  onSettle,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  /** "Wednesday". */
  day: string;
  /** "Fri 04:00". */
  until: string;
  items: YesterdayItem[];
  answers: Record<string, DidAnswer>;
  onAnswer: (key: string, answer: Exclude<DidAnswer, null>) => void;
  /** Freezes banked; 0 hides the switch. */
  freezes: number;
  useFreeze: boolean;
  onUseFreeze: (v: boolean) => void;
  onSettle: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Record ${day}`}
      description={`Anything you tick pays at the full rate. Open until ${until}.`}
      footer={
        <div className="sheet-foot">
          <Button variant="primary" size="lg" block onClick={onSettle} disabled={busy}>
            Settle {day} now
          </Button>
          <p className="t-meta">Or leave it: it settles on its own at {until}.</p>
        </div>
      }
    >
      <div className="y-list">
        {items.map((it) => (
          <div key={it.key} className="y-row">
            <div className="n">
              <b>{it.title}</b>
              <span>{it.meta}</span>
            </div>
            <div className="opt" role="group" aria-label={`Did you do ${it.title}?`}>
              <button type="button" className="y-opt did" aria-pressed={answers[it.key] === "did"} onClick={() => onAnswer(it.key, "did")}>
                Did
              </button>
              <button type="button" className="y-opt didnt" aria-pressed={answers[it.key] === "didnt"} onClick={() => onAnswer(it.key, "didnt")}>
                Didn&apos;t
              </button>
            </div>
          </div>
        ))}
      </div>
      {freezes > 0 && (
        <div className="today-opt-card">
          <HeldGlyph kind="freeze" size={22} className="held" />
          <div className="n">
            Use a freeze for {day}
            <span>
              {freezes} banked. A freeze holds the whole day; nothing is owed.
            </span>
          </div>
          <Switch checked={useFreeze} onChange={onUseFreeze} label={`Use a freeze for ${day}`} />
        </div>
      )}
    </Sheet>
  );
}

export interface RestOption {
  kind: "rest" | "sick" | "away";
  title: string;
  /** "Declared the day before" / "Same day is fine · once per 14 days". */
  meta: string;
  action: string;
  /** Why it is not on offer now ("Used on 22 Sep; next from 6 Oct"). */
  disabledReason?: string | null;
  onAction: () => void;
}

export function RestControls({
  open,
  onClose,
  options,
  extra,
  description = "Held days bridge the streak and owe nothing. Never backdated.",
}: {
  open: boolean;
  onClose: () => void;
  options: RestOption[];
  /** Below the options (M2 on Today: the vacation form, the declared days a Cancel can take back, an error line). */
  extra?: ReactNode;
  description?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Plan time off" description={description}>
      <div className="y-list">
        {options.map((o) => (
          <div key={o.kind} className="y-row">
            <HeldGlyph kind={o.kind} size={20} className="held-glyph" />
            <div className="n">
              <b>{o.title}</b>
              <span>{o.disabledReason ?? o.meta}</span>
            </div>
            <Button variant="secondary" onClick={o.onAction} disabled={!!o.disabledReason}>
              {o.action}
            </Button>
          </div>
        ))}
      </div>
      {extra}
    </Sheet>
  );
}

// ── M2 on Today: the pieces the board's own sheets add (lane D) ──────────

/** Record yesterday's sticky footer: [Settle Wednesday now], when it settles on its own, and that settling locks the day. */
export function SettleFooter({ label, until, lock, onSettle, busy }: { label: string; until: string; lock: string; onSettle: () => void; busy?: boolean }) {
  return (
    <div className="sheet-foot">
      <Button variant="primary" size="lg" block onClick={onSettle} disabled={busy}>
        {label}
      </Button>
      <p className="t-meta">
        {until} {lock}
      </p>
    </div>
  );
}

/** 'Use a freeze for Wed': only for a yesterday with no activity; once used it stays on. */
export function FreezeOption({
  label,
  sub,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="today-opt-card">
      <HeldGlyph kind="freeze" size={22} className="held" />
      <div className="n">
        {label}
        <span>{sub}</span>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

/** A vacation: first and last day (3 to 30 days, from tomorrow at the earliest). The caller validates and sends. */
export function VacationForm({
  min,
  initialTo,
  onSubmit,
  validate,
  busy,
}: {
  /** The first day on offer (tomorrow, or the launch day). */
  min: string;
  initialTo: string;
  onSubmit: (from: string, to: string) => void;
  validate: (from: string, to: string) => string | null;
  busy?: boolean;
}) {
  const [from, setFrom] = useState(min);
  const [to, setTo] = useState(initialTo);
  const problem = validate(from, to);
  return (
    <form
      className="vac-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!problem) onSubmit(from, to);
      }}
    >
      <label className="vac-field">
        <span className="t-eyebrow">First day</span>
        <input className="today-input" type="date" min={min} value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="vac-field">
        <span className="t-eyebrow">Last day</span>
        <input className="today-input" type="date" min={from || min} value={to} onChange={(e) => setTo(e.target.value)} />
      </label>
      <p className="t-meta vac-note" aria-live="polite">
        {problem ?? "Every day of it is held: nothing is owed and the streak holds."}
      </p>
      <Button type="submit" variant="secondary" disabled={busy || !!problem}>
        Set vacation
      </Button>
    </form>
  );
}

/** Declared days a Cancel can still take back (each before its day starts). */
export function CancelList({ items, onCancel, busy }: { items: { key: string; label: string; held: "rest" | "sick" | "away" }[]; onCancel: (key: string) => void; busy?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="y-list rest-declared">
      <p className="t-eyebrow y-label">Declared</p>
      {items.map((it) => (
        <div key={it.key} className="y-row">
          <HeldGlyph kind={it.held} size={20} className="held-glyph" />
          <div className="n">
            <b>{it.label}</b>
          </div>
          <Button variant="quiet" onClick={() => onCancel(it.key)} disabled={busy}>
            Cancel
          </Button>
        </div>
      ))}
    </div>
  );
}
