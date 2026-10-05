"use client";

/**
 * Constraint safety: confirm to unlock (lane R5; contracts §19). Every body
 * or care plan asks once, whatever the user wrote, and a craft plan asks when
 * its words carry a cue or can't be read: until the user answers here, every
 * plan path places only the track's own easy kinds (easy, mobility and
 * technique sessions; planning the week and keeping a log; the technique
 * session). This is where they answer:
 *
 *   "Your words mention “Running causes me knee pain”. Which activities
 *   should the plan avoid?" (with nothing to quote: "Before the plan adds
 *   harder or longer sessions, it asks once."), one box per session type;
 *   a box the user's words suggest comes pre-ticked, quoting them ("From
 *   your words: “…”"; a suggestion never leaves anything out by itself);
 *   after the words changed, "You answered on 3 Oct, before your words
 *   changed."; the plan's line while it waits; HEALTH_LINE.
 *
 * Answering is an explicit act (the lead's decision 1): with a box ticked the
 * button is [Save my answers], and the line beside it says what Save leaves
 * out and what the plan may then include; with nothing ticked it is [Nothing
 * to avoid]. Save with nothing ticked is never offered, and an unticked row
 * is never sent as "fine". Both send the card's answer (ActivityCardAnswer)
 * with the key of the words it was shown against: words changed meanwhile
 * (another tab, another device) are refused, the page re-reads, and the card
 * asks again (decision 3). Once answered the card shrinks to what the user
 * said ("You said to avoid: Strength session (5 Oct)." or "You said there's
 * nothing to avoid (5 Oct)."), with [Change], for the life of the plan. When
 * an answer takes a started practice off Today (decision 4, R4's reply
 * `paused`), a quiet toast says so, with Undo.
 *
 * Places: the draft review and the living roadmap (ActivityConfirmCard), the
 * Start sheet (its "start" variant), and the intake (IntakeActivities: the
 * answer is confirmed on the form and saved right after the intake, before
 * the plan is built). Nothing here is red, and nothing reads a cue as a
 * diagnosis or calls a session safe.
 */
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import type { DayKey } from "@/lib/life-day";
import type { ActivityCardAnswer, ActivityConfirmView, ActivityRow } from "@/lib/roadmap-types";
import { ACTIVITY_ANSWER_STALE, ACTIVITY_CARD_NAME, ACTIVITY_NOTHING_TO_AVOID, type CatalogKey } from "@/lib/roadmap-catalog";
import {
  ACTIVITY_CHANGE_WORD,
  ACTIVITY_CONFIRMED_LINE,
  ACTIVITY_CONFIRM_WORD,
  ACTIVITY_HOW_LINE,
  ACTIVITY_INTAKE_HOW_LINE,
  ACTIVITY_NOT_PAUSED_TITLE,
  ACTIVITY_PAUSED_TITLE,
  ACTIVITY_QUESTION,
  ACTIVITY_REPLAN_LINE,
  ACTIVITY_SAVED_LINE,
  ACTIVITY_SAVE_WORD,
  ACTIVITY_UNREAD_LINE,
  HEALTH_LINE,
  KIND_NAME,
  activityLeadLine,
  activityNotPausedLine,
  activityPausedLine,
  activityPendingLine,
  activityRowLine,
  activitySaveLine,
  activityStaleLine,
  activitySuggestedLine,
  activitySummaryLines,
  dayLabel,
} from "./roadmap-copy";
import { activityAsksOf, activityAvoidOf, activityCardAnswerOf, activityCardOf, activityNothingToAvoidOf, activityOpenOf, notPausedOfReply, pausedOfReply, rowsAnsweredBy } from "./roadmap-ui-model";
import { useRoadmapAction, type RoadmapRuntime } from "./roadmap-runtime";
import { notePauseSeen } from "./roadmap-pauses";
import "./roadmap.css";

/** The card's DOM id ("Next item to decide" and the Start sheet's pointer land here). */
export const ACTIVITY_DOM_ID = "rm-activities";

/** A body or care plan's card carries HEALTH_LINE ("Not medical advice …"), and so does a craft plan's that asks (its words name a strain or a pain). */
export function activityHealthOf(v: { track: string; on?: boolean }): boolean {
  return v.track === "BODY" || v.track === "CARE" || (v.track === "CRAFT" && v.on === true);
}

/** The list of boxes: each ticked box is a kind to avoid; each row's line quotes the user's words or their answer. */
function AvoidList({ rows, avoid, onToggle, today, disabled }: { rows: readonly ActivityRow[]; avoid: ReadonlySet<CatalogKey>; onToggle: (k: CatalogKey) => void; today?: DayKey; disabled?: boolean }) {
  const base = useId();
  return (
    <ul className="rm-avd-list">
      {rows.map((r, i) => {
        const id = `${base}-${i}`;
        const line = activityRowLine(r, today);
        return (
          <li key={r.kind} className="rm-avd-row" data-state={r.state}>
            <label className="rm-avd-hit">
              <input id={id} type="checkbox" className="rm-avd-box" checked={avoid.has(r.kind)} disabled={disabled} onChange={() => onToggle(r.kind)} aria-describedby={line ? `${id}-w` : undefined} />
              <span className="rm-avd-n">{KIND_NAME[r.kind] ?? r.kind}</span>
            </label>
            {line && (
              <p id={`${id}-w`} className="rm-avd-w">
                {line}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function useAvoid(rows: readonly ActivityRow[]) {
  const initial = useMemo(() => activityAvoidOf(rows), [rows]);
  const [avoid, setAvoid] = useState<ReadonlySet<CatalogKey>>(() => new Set(initial));
  const toggle = (k: CatalogKey) => setAvoid((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const reset = () => setAvoid(new Set(initial));
  return { avoid, toggle, reset };
}

/** The ticks that count: the boxes on the card's rows (a kind hidden by the exam or practice filter is never sent). */
function tickedOf(rows: readonly ActivityRow[], avoid: ReadonlySet<CatalogKey>): number {
  return rows.filter((r) => avoid.has(r.kind)).length;
}

/** The question: the user's quoted words (or, with none, what the plan asks before), then "Which activities should the plan avoid?" (one legend for the boxes). */
function Question({ view, today }: { view: ActivityConfirmView; today?: DayKey }) {
  const stale = activityAsksOf(view) ? activityStaleLine(view.staleDay, today) : null;
  return (
    <>
      <legend className="rm-avd-q">{`${activityLeadLine(view.quotes, view.track)} ${ACTIVITY_QUESTION}`}</legend>
      {stale && <p className="rm-avd-m rm-ink1">{stale}</p>}
      {view.unparseable && <p className="rm-avd-m">{ACTIVITY_UNREAD_LINE}</p>}
    </>
  );
}

/** The lines under the boxes: how to answer, what the plan places meanwhile (while it asks), the suggestions still placed, HEALTH_LINE. */
function OpenLines({ view, how, health }: { view: ActivityConfirmView; how: string; health: boolean }) {
  const suggested = activitySuggestedLine(view.rows.filter((r) => r.state === "WORDS").map((r) => KIND_NAME[r.kind] ?? r.kind));
  return (
    <>
      <p className="rm-avd-m">{how}</p>
      {activityAsksOf(view) && <p className="rm-avd-p">{activityPendingLine(view.safeKinds)}</p>}
      {suggested && <p className="rm-avd-m">{suggested}</p>}
      {health && <p className="rm-it-why">{HEALTH_LINE}</p>}
    </>
  );
}

/**
 * The answer's button, never a Save with nothing ticked (the lead's decision
 * 1): [Save my answers] (or the intake's [Confirm these]) with a box ticked,
 * [Nothing to avoid] with none; the line beside it says what the act does.
 */
function AnswerActs({ ticked, listed, pending, saveWord, onSave, onNothing, onCancel }: { ticked: number; listed: number; pending?: boolean; saveWord: string; onSave: () => void; onNothing: () => void; onCancel?: () => void }) {
  const line = activitySaveLine(ticked, listed);
  return (
    <>
      {line && (
        <p className="rm-avd-m rm-ink1" aria-live="polite">
          {line}
        </p>
      )}
      <div className="rm-acts">
        {ticked > 0 ? (
          <Button variant="primary" disabled={pending} onClick={onSave}>
            {pending ? "Saving…" : saveWord}
          </Button>
        ) : (
          <Button variant="primary" disabled={pending} onClick={onNothing}>
            {pending ? "Saving…" : ACTIVITY_NOTHING_TO_AVOID}
          </Button>
        )}
        {onCancel && (
          <Button variant="quiet" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </>
  );
}

/** The answered card's lines: the user's answer and what the plan may now include; "You answered on …" when nothing else shows. */
function summaryOf(view: Pick<ActivityConfirmView, "rows" | "answered" | "none">, today?: DayKey): string[] {
  const lines = activitySummaryLines(view, today);
  if (lines.length === 0 && view.answered) return [`You answered on ${dayLabel(view.answered, today)}.`];
  return lines;
}

/**
 * After a save: the toast (with Re-plan when an ACTIVE plan's unstarted
 * milestones change), and, when the answer took started practices off Today
 * (decision 4), a quiet toast naming them with Undo (the existing
 * unarchiveTask, history kept). What happened to each task is noted for the
 * roadmap's rows (roadmap-pauses; the lead's ruling 3): taken off Today,
 * still on Today (R4's `notPaused`), and, once its Undo lands, back on Today.
 */
export function announceActivitySaved(reply: unknown, roadmapId: string, runtime: Pick<RoadmapRuntime, "actions" | "refresh">, onReplan?: () => void) {
  const replan = Boolean(reply && typeof reply === "object" && (reply as { replan?: unknown }).replan === true);
  if (replan && onReplan) pushToast({ title: "Answers saved", body: ACTIVITY_REPLAN_LINE, action: { label: "Re-plan", onAction: onReplan } });
  else pushToast({ title: "Answers saved", body: ACTIVITY_SAVED_LINE });
  const notPaused = notPausedOfReply(reply);
  const paused = pausedOfReply(reply);
  notePauseSeen(roadmapId, [...notPaused.map((p) => ({ templateId: p.templateId, seen: "NOT_PAUSED" as const })), ...paused.map((p) => ({ templateId: p.templateId, seen: "PAUSED" as const }))]);
  const stuck = activityNotPausedLine(notPaused.map((p) => p.title));
  if (stuck) pushToast({ key: `rm-not-paused:${roadmapId}`, title: ACTIVITY_NOT_PAUSED_TITLE, body: stuck, holdMs: 10000 });
  const body = activityPausedLine(paused.map((p) => p.title));
  if (paused.length === 0 || !body) return;
  pushToast({
    key: `rm-paused:${roadmapId}`,
    title: ACTIVITY_PAUSED_TITLE,
    body,
    holdMs: 10000,
    action: {
      label: "Undo",
      onAction: () =>
        void Promise.all(paused.map((p) => runtime.actions.unarchiveTask(p.templateId).catch(() => ({ ok: false as const, error: "That didn't go through." }))))
          .then((all) => {
            // Only a task whose unarchive landed is back on Today; the others stay paused (their rows keep saying so).
            notePauseSeen(roadmapId, paused.filter((_, i) => all[i]?.ok).map((p) => ({ templateId: p.templateId, seen: "UNDONE" as const })));
            const failed = all.find((r) => !r.ok);
            if (failed && !failed.ok) pushToast({ title: "Not back on Today", body: failed.error });
          })
          .finally(() => runtime.refresh()),
    },
  });
}

/**
 * The confirm card on the draft review, the living roadmap ("plan") and the
 * Start sheet ("start"). It asks while rows wait (or suggestions wait on an
 * answer); otherwise it shows what the user said, with [Change]. Null when
 * there is nothing to show.
 */
export function ActivityConfirmCard({
  view,
  roadmapId,
  today,
  place,
  onReplan,
}: {
  view: ActivityConfirmView | null | undefined;
  roadmapId: string;
  today?: DayKey;
  place: "draft" | "plan" | "start";
  /** An ACTIVE plan's Re-plan (the save's toast offers it when the answers change milestones not started yet). */
  onReplan?: () => void;
}) {
  // A save refused because the words changed meanwhile: said once the page re-reads (the list below is the new words').
  const [staleRefused, setStaleRefused] = useState(false);
  const card = activityCardOf(view);
  if (!card) return null;
  return (
    <ActivityCardBody
      key={`${roadmapId}:${card.key}:${card.rows.map((r) => `${r.kind}.${r.state}.${r.day ?? ""}`).join(",")}`}
      view={card}
      roadmapId={roadmapId}
      today={today}
      place={place}
      onReplan={onReplan}
      staleRefused={staleRefused}
      setStaleRefused={setStaleRefused}
    />
  );
}

function ActivityCardBody({
  view,
  roadmapId,
  today,
  place,
  onReplan,
  staleRefused,
  setStaleRefused,
}: {
  view: ActivityConfirmView;
  roadmapId: string;
  today?: DayKey;
  place: "draft" | "plan" | "start";
  onReplan?: () => void;
  staleRefused: boolean;
  setStaleRefused: (v: boolean) => void;
}) {
  const opens = activityOpenOf(view);
  const [editing, setEditing] = useState(false);
  const { avoid, toggle, reset } = useAvoid(view.rows);
  const { run, pending, error, setError, runtime } = useRoadmapAction();
  // The Start sheet of a body plan carries HEALTH_LINE already (once per sheet).
  const health = activityHealthOf(view) && !(place === "start" && view.track === "BODY");
  const open = opens || editing;
  const Wrap = place === "start" ? "div" : "section";
  const wrapClass = place === "start" ? "sunk rm-avd rm-avd-in" : "card rm-avd";
  const role = place === "start" ? "group" : undefined;

  if (!open) {
    const lines = summaryOf(view, today);
    return (
      <Wrap className={wrapClass} id={place === "start" ? undefined : ACTIVITY_DOM_ID} role={role} aria-label={ACTIVITY_CARD_NAME}>
        <div className="rm-avd-sum">
          {lines.map((l) => (
            <p key={l} className="rm-avd-m rm-ink1">
              {l}
            </p>
          ))}
          <button type="button" className="rm-ilink" onClick={() => setEditing(true)} aria-label="Change which activities the plan avoids">
            {ACTIVITY_CHANGE_WORD}
          </button>
        </div>
        {health && <p className="rm-it-why">{HEALTH_LINE}</p>}
      </Wrap>
    );
  }

  // The card's answer, with the key of the words on screen (refused, and asked again, when they changed meanwhile).
  const send = (answer: ActivityCardAnswer) =>
    run(
      async (a) => {
        const res = await a.setActivityVerdicts(roadmapId, answer);
        if (!res.ok && res.error.includes(ACTIVITY_ANSWER_STALE)) {
          setStaleRefused(true);
          runtime.refresh();
        }
        return res;
      },
      (reply) => {
        setStaleRefused(false);
        setEditing(false);
        announceActivitySaved(reply, roadmapId, runtime, onReplan);
      }
    );
  const save = () => {
    const answer = activityCardAnswerOf(view, avoid);
    if (answer) send(answer);
  };
  const cancel = () => {
    reset();
    setError(null);
    setEditing(false);
  };

  return (
    <Wrap className={wrapClass} id={place === "start" ? undefined : ACTIVITY_DOM_ID} role={role} aria-label={ACTIVITY_CARD_NAME}>
      <fieldset className="rm-avd-set" disabled={pending}>
        <Question view={view} today={today} />
        <AvoidList rows={view.rows} avoid={avoid} onToggle={toggle} today={today} />
      </fieldset>
      <OpenLines view={view} how={ACTIVITY_HOW_LINE} health={health} />
      {staleRefused && !error && (
        <p className="rm-avd-m rm-ink1" role="status">
          {ACTIVITY_ANSWER_STALE}
        </p>
      )}
      <AnswerActs
        ticked={tickedOf(view.rows, avoid)}
        listed={view.rows.length}
        pending={pending}
        saveWord={ACTIVITY_SAVE_WORD}
        onSave={save}
        onNothing={() => send(activityNothingToAvoidOf(view))}
        onCancel={editing && !opens ? cancel : undefined}
      />
      {error && <ActionError>{error}</ActionError>}
    </Wrap>
  );
}

/**
 * The intake's card (a body, care or craft track Area): the same question and
 * boxes as the plan's, run on the form as typed. [Confirm these] (a box
 * ticked) or [Nothing to avoid] records the user's answer on the form, with
 * the key of the words it was given against (`keyNow`); the form saves it
 * right after the intake (setActivityVerdicts), before the plan is built.
 * Words changed since: it asks again here, and a key the server no longer
 * holds is refused and asked again on the draft. An open draft's stored
 * answer shows as said, with [Change]. Nothing here unlocks without the
 * user's tap.
 */
export function IntakeActivities({
  view,
  keyNow,
  confirmed,
  onConfirm,
  today,
}: {
  view: ActivityConfirmView;
  /** The key the answer would be given against now (cueKeyOf the form's words). */
  keyNow: string;
  confirmed: ActivityCardAnswer | null;
  onConfirm: (a: ActivityCardAnswer | null) => void;
  today?: DayKey;
}) {
  const card = activityCardOf(view);
  if (!card) return null;
  return <IntakeActivitiesBody key={`${keyNow}:${card.rows.map((r) => `${r.kind}.${r.state}`).join(",")}`} view={card} keyNow={keyNow} confirmed={confirmed} onConfirm={onConfirm} today={today} />;
}

function IntakeActivitiesBody({ view, keyNow, confirmed, onConfirm, today }: { view: ActivityConfirmView; keyNow: string; confirmed: ActivityCardAnswer | null; onConfirm: (a: ActivityCardAnswer | null) => void; today?: DayKey }) {
  const { avoid, toggle, reset } = useAvoid(view.rows);
  const [editing, setEditing] = useState(false);
  const fresh = confirmed != null && confirmed.key === keyNow;
  const opens = activityOpenOf(view) && !fresh;
  const health = activityHealthOf(view);
  if (!opens && !editing) {
    // Confirmed on this form (not saved yet), or the open draft's stored answer.
    const lines = fresh ? activitySummaryLines({ rows: rowsAnsweredBy(view.rows, confirmed), answered: null, none: confirmed.nothingToAvoid }, today) : summaryOf(view, today);
    return (
      <div className="sunk rm-avd rm-avd-in" id="rm-f-activities" role="group" aria-label={ACTIVITY_CARD_NAME}>
        <div className="rm-avd-sum">
          {fresh && <p className="rm-avd-m rm-ink1">{ACTIVITY_CONFIRMED_LINE}</p>}
          {lines.map((l) => (
            <p key={l} className="rm-avd-m rm-ink1">
              {l}
            </p>
          ))}
          <button type="button" className="rm-ilink" onClick={() => setEditing(true)} aria-label="Change which activities the plan avoids">
            {ACTIVITY_CHANGE_WORD}
          </button>
        </div>
        {health && <p className="rm-it-why">{HEALTH_LINE}</p>}
      </div>
    );
  }
  const confirm = (answer: ActivityCardAnswer | null) => {
    if (!answer) return;
    onConfirm(answer);
    setEditing(false);
  };
  return (
    <div className="sunk rm-avd rm-avd-in" id="rm-f-activities">
      <fieldset className="rm-avd-set">
        <Question view={view} today={today} />
        <AvoidList rows={view.rows} avoid={avoid} onToggle={toggle} today={today} />
      </fieldset>
      <OpenLines view={view} how={ACTIVITY_INTAKE_HOW_LINE} health={health} />
      <AnswerActs
        ticked={tickedOf(view.rows, avoid)}
        listed={view.rows.length}
        saveWord={ACTIVITY_CONFIRM_WORD}
        onSave={() => confirm(activityCardAnswerOf({ key: keyNow, rows: view.rows }, avoid))}
        onNothing={() => confirm(activityNothingToAvoidOf({ key: keyNow }))}
        onCancel={
          editing && !opens
            ? () => {
                reset();
                setEditing(false);
              }
            : undefined
        }
      />
    </div>
  );
}
