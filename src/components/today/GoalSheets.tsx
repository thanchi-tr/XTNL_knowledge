"use client";

import { useId, useState, type FormEvent } from "react";
import type { GoalPayout } from "@/lib/goals";
import type { DayKey } from "@/lib/life-day";
import { Button } from "@/components/ui/Button";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { GOAL_CLOSE_FINAL, goalCloseCopy, goalRescheduleError, goalRescheduleRange } from "./board-ui";

/** 'Closing now pays ⬡ 4.8': the ⬡ becomes the MP glyph, kept with its figure. */
function MpText({ text }: { text: string }) {
  const at = text.indexOf("⬡ ");
  if (at < 0) return <>{text}</>;
  const rest = text.slice(at + 2);
  const end = rest.search(/\s|$/);
  return (
    <>
      {text.slice(0, at)}
      <span className="cur">
        <CurrencyGlyph kind="mp" />
        <span className="num">{rest.slice(0, end)}</span>
        <span className="sr-only"> MP</span>
      </span>
      {rest.slice(end)}
    </>
  );
}

/** 'measures removed by a reset' → 'Measures removed by a reset' (a line of its own). */
function capitalised(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** The Close sheet's state: loading the preview, the preview (null: not open any more), or the preview failing. */
export type GoalClosePreview = { state: "loading" } | { state: "ready"; payout: GoalPayout | null } | { state: "error"; error: string };

/** A roadmap milestone's goal, for its Close sheet: why it states 0, and why it is never measured again (F15, F16 seam 4). */
export interface GoalCloseRoadmap {
  /** "knowledge is paid by reviews" (after "Pays nothing ·"). */
  zeroReason: string | null;
  /** "measures removed by a reset", "roadmap archived" or "replaced by Start again" (the preview then pays 0, "not measured"). */
  note: string | null;
}

/**
 * Close a goal (M5, launched only): the exact figure closing now pays and
 * why (previewGoalClose, the same decision the close makes), then Confirm.
 * Closing is final and settled once (0 included); the server decides again
 * as it writes, and the board says so if that differs. The kit's dismiss
 * button is named 'Cancel' here, so it never sounds like the Close action.
 *
 * A roadmap milestone's goal adds, in ink: why it states 0 ('Pays nothing ·
 * knowledge is paid by reviews'), its note when it is never measured again
 * ('Measures removed by a reset', 'Replaced by Start again'), and, on a server with
 * writes off, the payout's readingNote (goals.ts: "not recorded on this
 * server", roadmap F10) — its g was worked out live and recorded nowhere,
 * and the close itself refuses there.
 */
export function GoalCloseSheet({
  open,
  title,
  preview,
  busy,
  error,
  onConfirm,
  onClose,
  roadmap = null,
}: {
  open: boolean;
  title: string;
  preview: GoalClosePreview;
  busy: boolean;
  /** The close's own refusal ('Something changed; try again.'), shown in the sheet. */
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
  /** A ROADMAP goal's zero reason and reset note (null for every other goal). */
  roadmap?: GoalCloseRoadmap | null;
}) {
  const copy = preview.state === "ready" ? goalCloseCopy(preview.payout) : null;
  const readingNote = preview.state === "ready" ? (preview.payout?.readingNote?.trim() ?? "") : "";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Close “${title}”`}
      description={GOAL_CLOSE_FINAL}
      closeLabel="Cancel"
      footer={
        copy?.confirm ? (
          <Button variant="primary" size="lg" block onClick={onConfirm} disabled={busy}>
            {busy ? "Closing…" : <MpText text={copy.confirm} />}
          </Button>
        ) : undefined
      }
    >
      <div className="goal-close" aria-live="polite" aria-busy={preview.state === "loading" || busy ? true : undefined}>
        {preview.state === "loading" && <p className="t-meta">Working out what closing now pays…</p>}
        {preview.state === "error" && (
          <p className="t-error" role="alert">
            {preview.error}
          </p>
        )}
        {copy && (
          <>
            <p className="goal-close-head">
              <MpText text={copy.head} />
            </p>
            {copy.why && <p className="goal-close-why">Why: {copy.why}</p>}
            {copy.basis && (
              <p className="t-meta">
                <MpText text={copy.basis} />
              </p>
            )}
            {copy.depth && <p className="t-meta">{copy.depth}</p>}
            {roadmap?.zeroReason && <p className="t-meta">Pays nothing · {roadmap.zeroReason}</p>}
            {roadmap?.note && <p className="t-meta">{capitalised(roadmap.note)}</p>}
            {readingNote && <p className="t-meta">Live figure · {readingNote}</p>}
          </>
        )}
        {error && (
          <p className="t-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * Reschedule a goal carried past its due day: a new due day, today to ten
 * years out. Only the due day moves; what it stated it pays stays. Writes
 * no MP, so it is offered before launch too.
 */
export function GoalRescheduleSheet({
  open,
  formKey,
  title,
  today,
  busy,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Changes with each opening, so the date field starts fresh. */
  formKey: number;
  title: string;
  today: DayKey;
  busy: boolean;
  error: string | null;
  onSave: (day: DayKey) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Reschedule “${title}”`} description="Only the due day moves. What it pays stays as it was set. Nothing is owed.">
      <RescheduleForm key={formKey} today={today} busy={busy} error={error} onSave={onSave} />
    </Sheet>
  );
}

function RescheduleForm({ today, busy, error, onSave }: { today: DayKey; busy: boolean; error: string | null; onSave: (day: DayKey) => void }) {
  const range = goalRescheduleRange(today);
  const [day, setDay] = useState<string>(range.initial);
  const [local, setLocal] = useState<string | null>(null);
  const id = useId();
  const shown = local ?? error;

  function submit(e: FormEvent) {
    e.preventDefault();
    const bad = goalRescheduleError(day, today);
    setLocal(bad);
    if (!bad) onSave(day);
  }

  return (
    <form className="goal-resched" onSubmit={submit} noValidate>
      <label htmlFor={`${id}-d`} className="t-eyebrow">
        New due day
      </label>
      <input
        id={`${id}-d`}
        className="today-input"
        type="date"
        min={range.min}
        max={range.max}
        value={day}
        data-autofocus
        onChange={(e) => {
          setDay(e.target.value);
          setLocal(null);
        }}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? `${id}-e` : undefined}
        disabled={busy}
      />
      {shown && (
        <p id={`${id}-e`} className="t-error" role="alert">
          {shown}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block disabled={busy}>
        {busy ? "Saving…" : "Save the new day"}
      </Button>
    </form>
  );
}
