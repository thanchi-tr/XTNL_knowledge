"use client";

import { useState } from "react";
import Link from "next/link";
import { BANDS, completesItself, type Band, type Receipt } from "@/lib/life-types";
import { MINUTE_CHIPS, ruleOf, type BoardRow } from "@/lib/today-board";
import { SIZING_MAX_ATTEMPTS, effBand } from "@/lib/life-grade";
import { gradeChipOf, planBornBasisOf } from "@/lib/life-lexicon";
import { isRoadmapCaptureKey } from "@/lib/roadmap-types";
import type { DayKey } from "@/lib/life-day";
import { formatExpiry } from "@/lib/format-date";
import { BAND_BLURB, BAND_LABEL, fmtMinutes, fmtXp } from "./format";
import { pendingLineOf, ratingGate, tomorrowOffer } from "./board-ui";
import type { PendingNext } from "@/lib/duty-rule";
import { dayLabel } from "@/lib/duty-view";
import type { TaskStyle } from "@/lib/task-style";
import { TaskMonth } from "@/components/task-style/TaskMonth";
import { TaskStylePicker } from "@/components/task-style/TaskStylePicker";
import { stepsAllowed } from "@/lib/subtasks";
import { StepsEditor, type StepsSave } from "./StepsEditor";
import { CompetencyLink } from "./CompetencyLink";
import { PROOF_COUNTS_NOTE, pageChipsOf, pagesLabelOf, proofMinuteChipsOf, timerConfirmOf, timerMinutesOf, type TimerView } from "@/lib/proof";
import { useTimerClock } from "./TimerChip";

/** A slower write this drawer started and is waiting on. */
export type DrawerWork = { kind: "resize" } | { kind: "rate"; override: number } | { kind: "rename"; title: string } | { kind: "steps" } | { kind: "timer" };

interface Props {
  row: BoardRow;
  /** The board's clock (ms), for the grade chip's 'sizing…' and 'frozen' and the self-rating cooldown. */
  now: number;
  /** The board's life day. */
  today: DayKey;
  /** Minutes picked from the chips; null means 'at the estimate'. */
  minutes: number | null;
  onMinutes: (m: number | null) => void;
  /** The price with those minutes. */
  projection: Receipt;
  /** The price as the minimum version, when the task has one. */
  minimumProjection: Receipt | null;
  busy: boolean;
  /** A resize, self-rating or rename in flight for this task. */
  working: DrawerWork | null;
  onDone: () => void;
  onMinimum: () => void;
  onSkip: () => void;
  onTomorrow: () => void;
  onAgain: () => void;
  onRename: (title: string) => void;
  onArchive: () => void;
  onOverride: (override: number) => void;
  onResize: () => void;
  /** M2 (F3): a must's rule pills and its pending change; null before Duty has a launch day (the pre-M2 drawer). */
  rule?: DrawerRule | null;
  /** The task's icon and colour (BoardData.styles); the month calendar and the picker show with it. */
  taskStyle?: TaskStyle | null;
  /** Fixtures and checks: no month read, no picker (they would call the server). */
  noMonth?: boolean;
  /** Fixtures: the step editor's writes (the board uses the server actions). */
  stepsSave?: StepsSave;
  /** Ticks it for yesterday, when row.recordYesterday says the server would (a forgotten tick). */
  onYesterday?: () => void;
  /**
   * A work tab's drawer (work-boards.ts): no price on any button, and no Size panel (a size prices XP, and work pays
   * none; the server refuses a self-rating or a resize too). Absent: the personal Board's drawer, exactly as before.
   */
  work?: boolean;
  /** Defer and abort (task-decisions.ts): opens the Defer… sheet. Absent: no Defer… (fixtures). */
  onDefer?: () => void;
  /** Opens the Abort… sheet. Absent: no Abort…. */
  onAbort?: () => void;
  /** The task's decisions: the nudge from its third defer, and an abort just this time still undoable. */
  decision?: DrawerDecision | null;
  /**
   * Proof of work (blueprint P23): the row is a proof row (row.proof), so Done and Again take its minutes (a chip) or
   * its timer's (`timer`, read live here: null with none), and Did it yesterday its chip's (today's timer never counts
   * for yesterday). `project` prices a timer's count as the server bounds it. Absent: the drawer exactly as before.
   */
  proof?: { timer: TimerView | null; project: (timerMinutes: number) => Receipt } | null;
  /**
   * Pages proof (blueprint P24): a reading task's row (row.pages), so Done, Again and Did it yesterday take its pages
   * (a chip, `picked`; null for none), at least the day's `target` when it has one. Absent: the drawer exactly as before.
   */
  pages?: { target: number | null; picked: number | null; onPick: (pages: number | null) => void } | null;
}

/** What the drawer says of a task's decisions (task-decisions.ts). */
export interface DrawerDecision {
  /** "Deferred 3 times — break it into steps or abort it?"; null below three. */
  nudge: string | null;
  /** An abort just this time made minutes ago: its line ("Aborted just this time · No time") and its Undo. */
  recent: { line: string; onUndo: () => void } | null;
}

/** M2 (F3): what the drawer offers a must. A weakening is deferred seven days once Duty is live; a strengthening is immediate. */
export interface DrawerRule {
  /** A pending weakening: 'Pending: archived on Thu 8 Oct · [Keep it]'. */
  pending: PendingNext | null;
  /** TaskTemplate.compulsoryOnRest: 'Even on rest days'. */
  onRest: boolean;
  /** When 'Not a must' would take effect (deferred); null when it would be immediate. */
  unflagFrom: DayKey | null;
  /** When turning 'Even on rest days' off would take effect (deferred); null when immediate. */
  restOffFrom: DayKey | null;
  onNotMust: () => void;
  onOnRest: (on: boolean) => void;
  onKeep: () => void;
}

/** The grade chip's tone: ink for a settled grade, the held hue for one still sizing (always with its words). */
const CHIP_CLASS = { muted: "ink-2", blue: "ink-1", green: "ink-0" } as const;

/**
 * Everything a row can do besides the one-tap tick: report real minutes (the
 * price re-projects as the chips change), do the minimum version, skip,
 * move to tomorrow, do it again, rename, archive — and the Size panel, which
 * says how the task was graded and lets the player self-rate within the
 * published limits.
 *
 * It only offers what the server will accept: no 'Tomorrow' on a deadline
 * (compulsory ones only move earlier; the others would be pulled in or
 * shed their late factor), and the size buttons close, with the date they
 * reopen, while the weekly self-rating cooldown runs.
 */
export function TaskDrawer(props: Props) {
  const { row, minutes, projection, busy, working } = props;
  const t = row.template;
  const open = row.state === "open" || row.state === "skipped";
  const recurring = !!ruleOf(t);
  const study = !!row.auto;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);

  const machineIdx = BANDS.indexOf(t.band);
  const pendingRate = working?.kind === "rate" ? working.override : null;
  const effective: Band = effBand(t.band, pendingRate ?? t.bandOverride);
  const maxIdx = Math.min(BANDS.length - 1, machineIdx + 1);
  const resizing = working?.kind === "resize";
  // A plan-born task (roadmap Start, 'rm:…'; decision 50): no model sizes or explains it. No Resize (the server refuses
  // it too), and its "Why" is code's words from its own columns, never the stored basis.
  const planBorn = isRoadmapCaptureKey(t.captureKey);
  const canResize = !planBorn && !t.gradeFrozen && t.gradeAttempts < SIZING_MAX_ATTEMPTS && !t.sizing;
  const why = planBorn ? planBornBasisOf(t) : t.gradeBasis;
  const rating = ratingGate(t, props.now);
  const tomorrow = tomorrowOffer(t, props.today);
  const locked = busy || working !== null;
  const chip = gradeChipOf(
    {
      gradeSource: t.gradeSource,
      gradeConfidence: t.gradeConfidence,
      gradeAttempts: t.gradeAttempts,
      gradeFrozenAt: t.gradeFrozenAt ? new Date(t.gradeFrozenAt) : null,
      bandOverride: t.bandOverride,
      createdAt: new Date(t.createdAt),
      planBorn,
    },
    new Date(props.now)
  );

  /** ' · ≈ 3.6' after an action on the personal Board; nothing on a work tab (work pays no XP). */
  const price = (xp: number) => (props.work ? "" : ` · ≈ ${fmtXp(xp)}`);
  // Proof of work (P23): a proof row's full tick needs a chip's minutes or its timer's (the server refuses it otherwise).
  const proof = props.proof ?? null;
  const timer = proof?.timer ?? null;
  // The timer's minutes, live (the row's chip moves on the same 15 s clock); under a minute is no minutes at all.
  const clockNow = useTimerClock(!!timer?.running);
  const timed = timer ? timerMinutesOf(timer, Math.max(clockNow, Date.parse(timer.startedAt))) : 0;
  const timerMinutes = timer && timed >= 1 ? timed : null;
  // A timer across 04:00 or past twice the estimate: Done here is the confirmation the row's one tap waited for.
  const timerAsk = timer && timerMinutes != null && minutes == null ? timerConfirmOf(timer, row.day, row.estMinutes, Math.max(clockNow, Date.parse(timer.startedAt))) : null;
  const proofMinutes = proof ? (minutes ?? timerMinutes) : null;
  const needsMinutes = !!proof && proofMinutes == null;
  // A proof habit done today shows its chips too, so 'Again' can take the minutes.
  const againNeedsMinutes = !!proof && row.state === "done" && recurring && row.lane !== "yesterday";
  const minutesWhat = proof
    ? minutes != null
      ? fmtMinutes(minutes)
      : timerMinutes != null
        ? `timer ${fmtMinutes(timerMinutes)}`
        : "pick the minutes"
    : minutes != null
      ? fmtMinutes(minutes)
      : `~${fmtMinutes(row.estMinutes)}`;
  // Done's price: a timer's count is priced as the server bounds it (its own minutes), a chip's as projected.
  const doneXp = proof && minutes == null && timerMinutes != null ? proof.project(timerMinutes).xp : projection.xp;
  // A proof row's chips are its estimate's shares (half to twice it), so a long deep-work task can report its time.
  const minuteChips: readonly number[] = proof ? proofMinuteChipsOf(row.estMinutes) : MINUTE_CHIPS;
  // Pages proof (P24): a reading task's full tick takes its pages, at least the day's target when it has one.
  const pages = props.pages ?? null;
  const needsPages = !!pages && pages.target != null && (pages.picked == null || pages.picked < pages.target);
  const againNeedsPages = !!pages && row.state === "done" && recurring && row.lane !== "yesterday";
  const pagesWhat = pages ? (pages.picked != null ? pagesLabelOf(pages.picked) : pages.target != null ? "pick the pages" : null) : null;
  // "Done · 30 pages", with its minutes when they were picked (or are asked for); without pages exactly as before.
  const doneWhat = pagesWhat ? (proof || minutes != null ? `${pagesWhat} · ${minutesWhat}` : pagesWhat) : minutesWhat;
  const blocked = needsMinutes || needsPages;
  // Did it yesterday sends the chip's minutes only: a timer (today's) never counts for yesterday.
  const yesterdayBlocked = (!!proof && minutes == null) || needsPages;
  const proofNote = !proof
    ? null
    : needsMinutes
      ? row.state === "done"
        ? "Deep work counts its time: pick the minutes it took."
        : "Deep work counts its time: pick the minutes it took, or start its timer on the row."
      : timerAsk
        ? timerAsk
        : minutes != null && timerMinutes != null
          ? `The minutes you picked count instead of its timer's. ${PROOF_COUNTS_NOTE}`
          : PROOF_COUNTS_NOTE;

  const closeEditor = () => {
    setTitle(t.title);
    setEditing(false);
  };

  return (
    <div className="today-drawer">
      {(open || againNeedsMinutes || againNeedsPages) && !study && (
        <>
          {pages && (
            <div className="today-drawer-row" role="group" aria-label="Pages read" data-chips="pages">
              {pageChipsOf(pages.target).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="today-pill num"
                  aria-pressed={pages.picked === n}
                  onClick={() => pages.onPick(pages.picked === n ? null : n)}
                >
                  {pagesLabelOf(n)}
                </button>
              ))}
            </div>
          )}
          <div className="today-drawer-row" role="group" aria-label="Minutes it took" data-chips="minutes">
            {minuteChips.map((m) => (
              <button
                key={m}
                type="button"
                className="today-pill num"
                aria-pressed={minutes === m}
                onClick={() => props.onMinutes(minutes === m ? null : m)}
              >
                {m} min
              </button>
            ))}
          </div>
          {open && (
            <div className="today-drawer-row">
              <button type="button" className="today-pill" data-tone="primary" disabled={busy || blocked} onClick={props.onDone}>
                Done{row.steps && !row.steps.checklist && !proof && !pages ? " · every step" : ""} · {doneWhat}
                {blocked ? "" : price(doneXp)}
              </button>
              {t.mvv && props.minimumProjection && (
                <button type="button" className="today-pill" disabled={busy} onClick={props.onMinimum}>
                  Do minimum: {t.mvv}
                  {price(props.minimumProjection.xp)}
                </button>
              )}
            </div>
          )}
          {proofNote && (
            <p className="today-drawer-note" data-proof="1">
              {proofNote}
            </p>
          )}
          {pages && (
            <p className="today-drawer-note" data-pages="1">
              {needsPages && pages.target != null
                ? `A reading task counts its pages: pick how many you read, at least ${pagesLabelOf(pages.target)}.`
                : "The pages are recorded with the tick; they never change its price."}
            </p>
          )}
        </>
      )}

      <div className="today-drawer-row">
        {open && recurring && !t.compulsory && row.lane !== "yesterday" && row.state !== "skipped" && (
          <button type="button" className="today-pill" disabled={busy} onClick={props.onSkip} title={props.work ? "Not today; its streak holds" : "0 XP; the streak holds"}>
            Skip today
          </button>
        )}
        {open && !recurring && row.lane !== "yesterday" && tomorrow.show && (
          <button type="button" className="today-pill" disabled={busy} onClick={props.onTomorrow}>
            Tomorrow
          </button>
        )}
        {row.recordYesterday && props.onYesterday && (
          <button type="button" className="today-pill" disabled={busy || yesterdayBlocked} onClick={props.onYesterday} title="Forgot to tick it? It counts on yesterday, as if ticked then.">
            Did it yesterday
            {price(row.recordYesterday.xp)}
          </button>
        )}
        {row.state === "done" && recurring && !study && row.lane !== "yesterday" && (
          <button type="button" className="today-pill" disabled={busy || blocked} onClick={props.onAgain} title={props.work ? "Once more today" : "Once more today; repeat decay applies"}>
            Again
            {price(projection.xp)}
          </button>
        )}
        <button
          type="button"
          className="today-pill"
          disabled={locked}
          onClick={() => {
            if (editing) return closeEditor();
            setTitle(t.title);
            setEditing(true);
          }}
          aria-expanded={editing}
        >
          {working?.kind === "rename" ? "Renaming…" : "Edit"}
        </button>
        <button type="button" className="today-pill" data-tone="danger" disabled={busy} onClick={props.onArchive} title="Archive it. Undo stays on screen for 10 seconds.">
          Archive
        </button>
      </div>
      {open && !recurring && row.lane !== "yesterday" && !tomorrow.show && tomorrow.reason && (
        <p className="today-drawer-note">{tomorrow.reason}</p>
      )}
      {/* Defer and abort (task-decisions.ts): each opens its sheet (a reason, and when, or how far). */}
      {open && row.lane !== "yesterday" && (props.onDefer || props.onAbort) && (
        <div className="today-drawer-row" role="group" aria-label="Put it off, or drop it">
          {props.onDefer && !completesItself(t.autoMetric) && (
            <button type="button" className="today-pill td-act" disabled={busy} onClick={props.onDefer} aria-haspopup="dialog" title="Off the board until a time you pick, with a reason">
              Defer…
            </button>
          )}
          {props.onAbort && (
            <button type="button" className="today-pill td-act" disabled={busy} onClick={props.onAbort} aria-haspopup="dialog" title={recurring ? "Just this time, or for good, with a reason" : "Drop it, with a reason"}>
              Abort…
            </button>
          )}
        </div>
      )}
      {props.decision?.nudge && <p className="today-drawer-note">{props.decision.nudge}</p>}
      {props.decision?.recent && (
        <div className="td-line">
          <span className="today-drawer-note">{props.decision.recent.line}</span>
          <button type="button" className="dec-undo" disabled={busy} onClick={props.decision.recent.onUndo}>
            Undo
          </button>
        </div>
      )}

      {props.rule && (t.compulsory || props.rule.pending) && (
        <>
          {props.rule.pending && (
            <div className="today-drawer-row">
              <span className="today-drawer-note">{pendingLineOf(props.rule.pending)}</span>
              <button type="button" className="today-pill" disabled={busy} onClick={props.rule.onKeep}>
                Keep it
              </button>
            </div>
          )}
          {t.compulsory && (
            <div className="today-drawer-row" role="group" aria-label="What makes it a must">
              {!props.rule.pending && (
                <button type="button" className="today-pill" disabled={busy} onClick={props.rule.onNotMust}>
                  Not a must{props.rule.unflagFrom ? ` · from ${dayLabel(props.rule.unflagFrom)}` : ""}
                </button>
              )}
              <button
                type="button"
                className="today-pill"
                aria-pressed={props.rule.onRest}
                // Turning it off is a weakening: refused while another change is pending.
                disabled={busy || (props.rule.onRest && !!props.rule.pending)}
                onClick={() => props.rule?.onOnRest(!props.rule.onRest)}
              >
                {/* Said before the tap: turning it off is a weakening, deferred seven days once Duty is live. */}
                Even on rest days{props.rule.onRest && props.rule.restOffFrom ? ` · off from ${dayLabel(props.rule.restOffFrom)}` : ""}
              </button>
            </div>
          )}
        </>
      )}

      {editing && (
        <form
          className="today-drawer-row"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = title.trim();
            if (clean && clean !== t.title) props.onRename(clean);
            setEditing(false);
          }}
        >
          <input
            className="today-input"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // Escape cancels the edit, and only the edit: the receipt and
              // any sheet above stay as they are.
              if (e.key === "Escape") {
                e.preventDefault();
                closeEditor();
              }
            }}
            aria-label="Title"
            // A tap on Edit is asking to type: the keyboard comes up with it.
            autoFocus
          />
          <button type="submit" className="today-pill" disabled={locked || !title.trim()}>
            Save
          </button>
        </form>
      )}
      {/* Steps are added here only, deliberately (Edit → Steps): no task has any until then. */}
      {editing && stepsAllowed(t) && row.lane !== "yesterday" && (
        <StepsEditor templateId={t.id} items={row.steps?.items ?? []} compulsory={t.compulsory} disabled={busy} save={props.stepsSave} />
      )}

      {!props.noMonth && (
        <section className="tsk-sec" aria-label="Month and look">
          <div className="tsk-sec-grid">
            <TaskMonth templateId={t.id} title={t.title} today={props.today} style={props.taskStyle} />
            <TaskStylePicker key={t.id} templateId={t.id} style={props.taskStyle} />
          </div>
        </section>
      )}
      {/* Skills (blueprint P5): the named skill this task's ticks count toward. Never on a work tab: work stays outside the game. */}
      {!props.work && !props.noMonth && <CompetencyLink key={t.id} templateId={t.id} />}
      {/* A personal habit's year (Tasks › Habits), its card scrolled to and ringed. Never on a work tab (not tracked there). */}
      {!props.work && t.kind === "HABIT" && recurring && (
        <div className="today-drawer-row">
          <Link className="td-record" href={`/today/habits#${encodeURIComponent(t.id)}`}>
            Track record ›
          </Link>
        </div>
      )}

      {!props.work && (
        <div className="today-size">
          <div className="today-size-h">
            <span className="t-eyebrow">Size</span>
            <span className={`t-mono ${CHIP_CLASS[chip.tone]}`} title={why ?? undefined}>
              {chip.label}
            </span>
          </div>

          <div className="today-bands" role="radiogroup" aria-label="Self-rated size" aria-busy={pendingRate !== null}>
            {BANDS.map((b, i) => {
              const allowed = i <= maxIdx;
              const current = b === effective;
              const usable = allowed && rating.open;
              return (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={current}
                  className="today-band"
                  data-current={current ? "1" : undefined}
                  disabled={locked || !usable || current}
                  onClick={() => props.onOverride(i - machineIdx)}
                  data-allowed={allowed ? undefined : "0"}
                  title={!allowed ? "A self-rating can go at most one band above the machine's" : !rating.open ? "Self-rating is closed until the weekly cooldown ends" : undefined}
                >
                  <span className="band-name">
                    {BAND_LABEL[b]}
                    {i === machineIdx ? " ·" : ""}
                  </span>
                  <span className="band-blurb">
                    {BAND_BLURB[b]}
                    {current && pendingRate !== null ? " · saving…" : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <dl>
            <dt>Why</dt>
            <dd>{why || "No rule matched; sized as ordinary effort until the AI's answer lands."}</dd>
            <dt>Machine grade</dt>
            <dd>
              {BAND_LABEL[t.band]} · ~{fmtMinutes(t.machineMinutes)}
              {/* A plan-born task's minutes are the plan's (its practice's band, or a step's grade), never the player's words. */}
              {t.estMinutes !== t.machineMinutes
                ? ` · ${planBorn ? "the plan set" : "you said"} ~${fmtMinutes(t.estMinutes)} (counts up to ${fmtMinutes(t.machineMinutes * 2)})`
                : ""}
              {/* No model sizes a plan-born task, so a band or model a stale row still carries is not shown as its grade. */}
              {!planBorn && t.aiBand && t.aiBand !== t.band ? ` · AI said ${BAND_LABEL[t.aiBand]}` : ""}
            </dd>
            {!planBorn && t.gradeModel && (
              <>
                <dt>Model</dt>
                <dd className="t-mono">
                  {t.gradeModel}
                  {t.gradePromptVersion != null ? ` · prompt v${t.gradePromptVersion}` : ""}
                </dd>
              </>
            )}
          </dl>

          <div className="today-drawer-row">
            {t.bandOverride !== 0 && (
              <button type="button" className="today-pill" disabled={locked || !rating.open} onClick={() => props.onOverride(0)}>
                Back to the machine&apos;s size
              </button>
            )}
            {(canResize || resizing) && (
              <button
                type="button"
                className="today-pill"
                disabled={locked}
                aria-busy={resizing}
                onClick={props.onResize}
                title="Ask the AI once more, before the size freezes"
              >
                {resizing ? "Sizing…" : "Resize"}
              </button>
            )}
            <span className="today-size-note">
              {!rating.open && rating.nextAt != null
                ? `Self-rated this week. The size can change again from ${formatExpiry(new Date(rating.nextAt))}.`
                : t.gradeFrozen
                  ? "Frozen. A self-rating applies to later ticks and can change once a week."
                  : "Freezes at the first tick or 24 h after capture."}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
