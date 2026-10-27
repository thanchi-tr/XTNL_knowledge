"use client";

/**
 * Finish and its summary (health-brief §3.5: one tap, plus one). A record, never a reward (D12, D14).
 *
 *   FinishPanel  the minutes it will count (training.ts finishMinutesOf: the least of what you type, start to now, the
 *                last set plus the grace, and 180), the name, "How hard was it?" (0 to 10, a record only), "Counts as:
 *                <habit>" pre-selected when the server found one due today (its tick pays as usual; nothing else
 *                here does), then Finish lift. Rows without ✓ are left out; while a set is still on its way to the
 *                server Finish waits ("Saving sets…"). Discard asks twice. Opening it moves the focus to its heading.
 *   LiftSummary  the server's answer, said as it came: the logged line (exercise.ts sessionLoggedLineOf), the totals,
 *                each movement (its sets, top set and e1RM), the new bests (PR moments: lines, never a celebration
 *                or a ledger row), a big jump held back with its Keep or Confirm, and the hard sets per group. No
 *                praise, no "!", nothing said as paid.
 */
import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { SESSION_LIMITS, SESSION_RECORD_COPY, sessionRefusalOf } from "@/lib/exercise";
import { entryLineOf, finishMinutesOf, groupLineOf, heldLineOf, prLineOf, totalsLineOf, type HeldJump, type JumpAnswer } from "@/lib/training";
import type { FinishedLift, LiftSessionView } from "@/lib/training-server";
import { LIFT_COPY, finishMinutesLineOf, parseFigure } from "./lift-model";

/** What the Finish panel holds as typed. */
export interface FinishDraft {
  label: string;
  minutes: string;
  rpe: number | null;
  countsAs: boolean;
  /** When Finish was opened (ms): the minutes are counted to it. */
  nowMs: number;
}

const RPE_CHIPS = Array.from({ length: SESSION_LIMITS.RPE_MAX - SESSION_LIMITS.RPE_MIN + 1 }, (_, i) => SESSION_LIMITS.RPE_MIN + i);

/** The minutes Finish would count, and which bound set them. */
export function finishPreviewOf(lift: Pick<LiftSessionView, "startedAt">, draft: Pick<FinishDraft, "minutes" | "nowMs">, lastSetMs: number | null) {
  const typed = parseFigure(draft.minutes);
  return finishMinutesOf({ startedAt: lift.startedAt, endedAt: draft.nowMs, lastSetAt: lastSetMs, reportedMin: typed != null && !Number.isNaN(typed) ? typed : null });
}

export function FinishPanel({
  lift,
  draft,
  lastSetMs,
  link,
  leftOut,
  saving = false,
  busy,
  error,
  discardArmed,
  onDraft,
  onFinish,
  onBack,
  onDiscard,
}: {
  lift: LiftSessionView;
  draft: FinishDraft;
  lastSetMs: number | null;
  /** The habit "Counts as" would tick (a lift dated today, a live day), or null. */
  link: { templateId: string; title: string } | null;
  /** Rows not logged: they are left out. */
  leftOut: boolean;
  /** A set is still saving: Finish waits for it (it would be left out, or land after the summary). */
  saving?: boolean;
  busy: boolean;
  error: string | null;
  discardArmed: boolean;
  onDraft: (patch: Partial<FinishDraft>) => void;
  onFinish: () => void;
  onBack: () => void;
  onDiscard: () => void;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement | null>(null);
  // The Finish button that opened it is gone: the focus moves to the panel's heading (once, on opening). The panel
  // takes the button's place, so nothing needs scrolling (and a page of fixtures never jumps to it).
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  const { minutes, by } = finishPreviewOf(lift, draft, lastSetMs);
  const refused = by !== "NO_SETS" && sessionRefusalOf({ kind: "LIFT", distanceKm: 0, durationMin: minutes, angleDeg: 0, poolM: null, avgWatts: null, variant: null }) != null;
  const counting = link != null && draft.countsAs;
  const note = counting ? (refused ? SESSION_RECORD_COPY.NOTE_REFUSED : SESSION_RECORD_COPY.NOTE_LINKED) : `${SESSION_RECORD_COPY.NOTE} ${SESSION_RECORD_COPY.LINK_HINT}.`;
  return (
    <section className="wt-lift-fin" aria-labelledby={`${id}-h`}>
      <h4 id={`${id}-h`} ref={heading} tabIndex={-1} className="wt-lift-name">
        Finish {lift.label ?? "this lift"}
      </h4>
      <p className="wt-lift-fin-min t-num">{finishMinutesLineOf(minutes, by)}</p>
      <div className="wt-ex-grid">
        <label className="wt-ex-f">
          <span className="wt-label">{LIFT_COPY.NAME}</span>
          <input className="wt-input" inputMode="text" maxLength={SESSION_LIMITS.LABEL_MAX} placeholder="Push day" value={draft.label} onChange={(e) => onDraft({ label: e.currentTarget.value })} disabled={busy} />
        </label>
        <label className="wt-ex-f">
          <span className="wt-label">{LIFT_COPY.MINUTES}</span>
          <input
            className="wt-input t-num"
            inputMode="numeric"
            placeholder={by === "NO_SETS" ? "" : String(Math.round(minutes))}
            value={draft.minutes}
            onChange={(e) => onDraft({ minutes: e.currentTarget.value })}
            disabled={busy}
          />
        </label>
      </div>
      <div className="wt-ex-f">
        <span className="wt-label" id={`${id}-rpe`}>
          {LIFT_COPY.RPE}
        </span>
        <div className="wt-ex-opts wt-ex-rpe" role="group" aria-labelledby={`${id}-rpe`}>
          {RPE_CHIPS.map((r) => (
            <ChipButton key={r} pressed={draft.rpe === r} onClick={() => onDraft({ rpe: draft.rpe === r ? null : r })} disabled={busy}>
              {r}
            </ChipButton>
          ))}
        </div>
      </div>
      {link && (
        <div className="wt-ex-opts" role="group" aria-label="Counts as">
          <ChipButton pressed={draft.countsAs} onClick={() => onDraft({ countsAs: !draft.countsAs })} disabled={busy}>
            Counts as: {link.title}
          </ChipButton>
        </div>
      )}
      <p className="t-meta wt-ex-note">{note}</p>
      {saving ? <p className="t-meta wt-lift-msg">{LIFT_COPY.SAVING}</p> : leftOut && <p className="t-meta wt-lift-msg">{LIFT_COPY.LEFT_OUT}</p>}
      <div className="wt-lift-acts">
        <Button variant="primary" className="wt-log" onClick={onFinish} disabled={busy || saving || by === "NO_SETS"}>
          {LIFT_COPY.FINISH_LIFT}
        </Button>
        <Button variant="quiet" onClick={onBack} disabled={busy}>
          Back
        </Button>
      </div>
      {error && (
        <p className="t-meta wt-msg" role="alert">
          {error}
        </p>
      )}
      <div className="wt-lift-acts">
        <Button variant="quiet" onClick={onDiscard} disabled={busy} aria-label={discardArmed ? "Sure? Discard it: this lift and its sets" : "Discard lift and its sets"}>
          {discardArmed ? "Sure? Discard it" : "Discard lift"}
        </Button>
      </div>
    </section>
  );
}

export function LiftSummary({
  finished,
  answers,
  busy,
  error,
  onAnswer,
  onDone,
}: {
  finished: FinishedLift;
  answers: Readonly<Record<string, JumpAnswer>>;
  busy: boolean;
  error: string | null;
  onAnswer: (held: HeldJump) => void;
  onDone: () => void;
}) {
  const id = useId();
  const unit = finished.unit;
  const s = finished.summary;
  const groups = groupLineOf(s.groups);
  return (
    <section className="wt-lift-sum" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="wt-lift-title">
        {finished.session.label ?? "Lift"} · summary
      </h3>
      <p className="wt-lift-sum-l">{finished.line}</p>
      <p className="t-meta wt-lift-msg t-num">{totalsLineOf(s, unit)}</p>
      {s.entries.length > 0 && (
        <ul className="wt-lift-lines">
          {s.entries.map((e) => (
            <li key={`${e.ord}:${e.movementKey}`}>{entryLineOf(e, unit)}</li>
          ))}
        </ul>
      )}
      {finished.moments.length > 0 && (
        <ul className="wt-lift-lines wt-lift-prs" aria-label="New bests">
          {finished.moments.map((p) => (
            <li key={`${p.movementKey}:${p.metric}`} className="wt-lift-pr">
              {prLineOf(p, unit)}
            </li>
          ))}
        </ul>
      )}
      {finished.held.map((h) => (
        <div key={h.setId} className="wt-lift-jump" role="group" aria-label="A big jump held back">
          <p className="wt-lift-msg">{heldLineOf(h, unit)}</p>
          <div className="wt-lift-acts">
            <Button variant="secondary" onClick={() => onAnswer(h)} disabled={busy || answers[h.setId] === (h.level === "DOUBLE" ? "CONFIRMED" : "KEPT")}>
              {h.level === "DOUBLE" ? "Confirm" : "Keep"}
            </Button>
          </div>
        </div>
      ))}
      {groups && <p className="t-meta wt-lift-msg">{groups}</p>}
      {error && (
        <p className="t-meta wt-msg" role="alert">
          {error}
        </p>
      )}
      <div className="wt-lift-acts">
        <Button variant="primary" className="wt-log" onClick={onDone} disabled={busy}>
          Done
        </Button>
      </div>
    </section>
  );
}
