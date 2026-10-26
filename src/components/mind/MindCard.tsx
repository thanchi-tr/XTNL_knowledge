"use client";

/**
 * Body › Mind (health-2026-10-27.md D1, D3, D8; brief §2.5, §2.6): the check-in's home. A record, never a reward: no
 * XP, MP, streak, quest or celebration, nothing in the economy reads it, and every value gets the same words.
 *
 *   entry    "Check in" opens the sheet (CheckInSheet); the receipt "Logged 14:32 · Calm, content" with Undo for
 *            UNDO_MS under it; while paused, the paused line and "Resume now" instead
 *   safety   "Need to talk? Lifeline 13 11 14" (tel:), always on the card
 *   low      the low-pattern card when mind.ts lowPatternOf says so: the contacts as tel: links, the GP line, that it
 *            stays on this page, and "Hide for a week" (dismissLowPattern). Never a modal, never red
 *   trend    the 14-day dot strip and this month's count (MindStrip), the weekly medians or "Calibrating" with any
 *            "Changed" marks, and "n of m were prompted" once prompts exist (MindWeeks); with none in the shown weeks
 *            but some stored from before them, it says they are kept (never "No check-ins yet")
 *   list     the last 14 days' check-ins, newest first, each with its own Delete (asks twice); under them "Older
 *            check-ins": every one before the 14 days, OLDER_PAGE at a time ("Show older"), each with the same Delete
 *   controls Pause for 1 week / 1 month (the check-ins are kept), and "Delete all check-ins" behind a confirm, always
 *            there while the card is (it answers plainly when there is nothing to delete)
 *
 * States: `view.ready` false draws nothing else but the safety line and one plain line: MIND_NOT_READY when the table
 * isn't on this database yet, or "Couldn't load your check-ins" when the read failed (view.failed: never the empty card,
 * so a fault never reads as "nothing logged"). While the switch is off the page draws MindOff instead ("Mind check-ins
 * arrive with the next update"), with "Delete all check-ins" when any are stored from before.
 *
 * Everything shown comes from the MindView (src/lib/mind.ts, computed on the server); `actions` are the server
 * actions (page) or fakes (fixtures). A write answers in place (the receipt, a hidden row, the pause) and re-renders
 * the route in its own response (refresh: true), so a fixture that saves nothing still shows what happened. A deleted
 * check-in takes its receipt with it, and focus never falls to <body> when Undo goes.
 */
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { addDays, type DayKey } from "@/lib/life-day";
import {
  DELETE_ALL_CONFIRM,
  DELETE_ALL_LABEL,
  LOW_CARD_CONTACTS,
  LOW_CARD_GP,
  LOW_CARD_HIDE,
  LOW_CARD_PRIVATE,
  LOW_CARD_TITLE,
  MIND_WEEKS,
  PAUSE_LENGTHS,
  RESUME_LABEL,
  STRIP_DAYS,
  cellWordsOf,
  dayLabelOf,
  deletedAllLineOf,
  isPaused,
  pausedLineOf,
  signedStep,
  storedLineOf,
  stressLabelOf,
  type MindView,
  type MoodCheckView,
  type PauseLength,
} from "@/lib/mind";
import { Button } from "@/components/ui/Button";
import { CheckInReceipt, CheckInSheet, SafetyLine, clockOf, type CheckInDraft } from "./CheckInSheet";
import { MindStrip, MindWeeks } from "./MindTrend";
import { REFRESH, type LoggedCheck, type MindActions } from "./types";

/** The not-ready line (mind-server MIND_NOT_READY, repeated here so the card imports no server module). */
export const MIND_NOT_READY_LINE = "Check-ins need a one-time database update first.";
/** A read that failed for another reason: said plainly, never drawn as an empty card. */
export const MIND_LOAD_FAILED_LINE = "Couldn't load your check-ins. Try again.";
export const MIND_EMPTY_COPY = "No check-ins yet. One tap on the grid is a whole check-in.";
/** None in the shown weeks, but some stored from before them (they keep their Delete under "Older check-ins"). */
export const MIND_OLD_ONLY_COPY = `No check-ins in the last ${MIND_WEEKS} weeks. Older ones are kept until you delete them.`;
export const MIND_OFF_LINE = "Mind check-ins arrive with the next update.";
const UNREACHABLE = "Couldn't reach the server. Try again.";

/** '1 older check-in', '15 older check-ins' (before the 14-day list). A count, never a value. */
export function olderLineOf(n: number): string {
  return n === 1 ? `1 check-in from before the last ${STRIP_DAYS} days.` : `${n} check-ins from before the last ${STRIP_DAYS} days.`;
}

function dayWords(day: DayKey, today: DayKey): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  return dayLabelOf(day);
}

/** 'Today 14:32', 'Mon 20 Oct 09:05'. */
const whenOf = (c: MoodCheckView, today: DayKey): string => `${dayWords(c.day, today)} ${clockOf(c.at)}`;

/** Focus the first button in a box on the next frame (the control that was tapped has just been replaced). */
function focusFirst(box: { readonly current: HTMLElement | null }) {
  requestAnimationFrame(() => box.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
}

/**
 * While MIND_LAUNCH_DAY is not in force: what is coming, and the safety line (it is always on the Mind view). Any
 * check-in stored from before (a switch rolled back, a rehearsal server's rows) can still be removed: with `stored` > 0
 * it says how many (a count, never a value) and offers "Delete all check-ins" behind its confirm. With none it is
 * exactly the coming-soon card.
 */
export function MindOff({ stored = 0, deleteAllChecks }: { stored?: number; deleteAllChecks?: MindActions["deleteAllChecks"] }) {
  const id = useId();
  // Once used, Delete all stays with its answer (the refresh brings `stored` back as 0, which would take it away).
  const [cleared, setCleared] = useState<string | null>(null);
  const showDelete = deleteAllChecks != null && (stored > 0 || cleared !== null);
  return (
    <section className="card pad-l mind-card" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-eyebrow mind-eyebrow">
        Mind
      </h2>
      <p className="t-body mind-lead">{MIND_OFF_LINE}</p>
      <p className="t-meta">A quick check-in: one tap for how you feel, one for stress. A record for you, never graded.</p>
      {stored > 0 && cleared === null && deleteAllChecks != null && <p className="t-body mind-stored t-num">{storedLineOf(stored)}</p>}
      {showDelete && (
        <>
          <DeleteAll deleteAll={deleteAllChecks} onDone={(n) => setCleared(deletedAllLineOf(n))} onGone={() => {}} />
          <p className="sr-only" role="status">
            {cleared ?? ""}
          </p>
        </>
      )}
      <SafetyLine />
    </section>
  );
}

export function MindCard({
  view,
  actions,
  receipt: initialReceipt = null,
  holdUndo = false,
  sheetOpen = false,
  draft,
}: {
  view: MindView;
  actions: MindActions;
  /** Fixtures: start on a receipt. */
  receipt?: LoggedCheck | null;
  /** Fixtures: keep the receipt's Undo on screen. */
  holdUndo?: boolean;
  /** Fixtures: start with the sheet open. */
  sheetOpen?: boolean;
  draft?: CheckInDraft;
}) {
  const id = useId();
  const [open, setOpen] = useState(sheetOpen);
  const [receipt, setReceipt] = useState<LoggedCheck | null>(initialReceipt);
  const [gone, setGone] = useState<readonly string[]>([]);
  const [lowHidden, setLowHidden] = useState(false);
  const [pause, setPause] = useState<{ until: DayKey | null } | null>(null);
  const [seenPause, setSeenPause] = useState(view.pausedUntil);
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Bumped by Delete all: the older pages already loaded start over (empty).
  const [cleared, setCleared] = useState(0);
  const [pending, startTransition] = useTransition();
  const entryRef = useRef<HTMLDivElement | null>(null);

  // The server's pause wins once the page re-renders with it (adjusting state during render, not in an effect).
  if (seenPause !== view.pausedUntil) {
    setSeenPause(view.pausedUntil);
    setPause(null);
  }
  const pausedUntil = pause ? pause.until : view.pausedUntil;
  const paused = isPaused(pausedUntil, view.today);

  if (!view.ready) {
    // Not read: the table isn't here yet, or the read failed (said plainly; never the empty card, its pause or delete).
    return (
      <section className="card pad-l mind-card" aria-labelledby={`${id}-h`}>
        <h2 id={`${id}-h`} className="t-eyebrow mind-eyebrow">
          Mind
        </h2>
        <p className="t-body mind-lead">{view.failed ? MIND_LOAD_FAILED_LINE : MIND_NOT_READY_LINE}</p>
        <p className="t-meta">{view.failed ? "What you logged is kept." : "Nothing can be logged until then."}</p>
        <SafetyLine />
      </section>
    );
  }

  /** Runs one write; `done` gets its value. A refusal or a lost answer is said once, inline. */
  function write<T>(call: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, done: (value: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await call();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        done(res.value);
      } catch {
        setError(UNREACHABLE);
      }
    });
  }

  function undo(check: LoggedCheck) {
    write(
      () => actions.deleteCheck(check.id, REFRESH),
      (v) => {
        setReceipt(null);
        setGone((g) => [...g, check.id]);
        setSaid(v.deleted === 0 ? "Already deleted." : "Check-in taken back.");
        focusFirst(entryRef);
      }
    );
  }

  /** A check-in deleted from a list: hidden here, and its receipt goes with it (its Undo would delete nothing). */
  function gotGone(cid: string) {
    setGone((g) => [...g, cid]);
    setReceipt((r) => (r && r.id === cid ? null : r));
  }

  function setPaused(length: PauseLength | null) {
    write(
      () => actions.pauseChecks(length, REFRESH),
      (v) => {
        setPause({ until: v.pausedUntil });
        setSaid(v.pausedUntil ? pausedLineOf(v.pausedUntil) : "Check-ins are on again.");
        // Pause sits at the card's foot and Resume at its head: focus follows the control that replaced it.
        focusFirst(entryRef);
      }
    );
  }

  function hideLow() {
    write(
      () => actions.dismissLowPattern(REFRESH),
      () => {
        setLowHidden(true);
        setSaid("Hidden for a week.");
      }
    );
  }

  const recent = view.recent.filter((c) => !gone.includes(c.id));
  const showLow = view.low.show && !lowHidden;
  const hasAny =
    recent.length > 0 || view.monthCount > 0 || (view.trend.kind === "calibrating" ? view.trend.checks > 0 : view.trend.weeks.some((w) => w.n > 0));
  // Stored before the 14-day list (inside the read window or not): each keeps its own Delete under "Older check-ins".
  const olderCount = Math.max(0, view.storedCount - view.recent.length);
  const shownReceipt = receipt && !gone.includes(receipt.id) ? receipt : null;

  return (
    <>
      <section className="card pad-l mind-card" aria-labelledby={`${id}-h`}>
        <h2 id={`${id}-h`} className="t-eyebrow mind-eyebrow">
          Mind
        </h2>

        {paused && pausedUntil ? (
          <div ref={entryRef} className="mind-paused">
            <p className="t-body">{pausedLineOf(pausedUntil)}</p>
            <Button variant="secondary" onClick={() => setPaused(null)} disabled={pending}>
              {RESUME_LABEL}
            </Button>
          </div>
        ) : (
          <div ref={entryRef} className="mind-entry">
            <Button variant="primary" size="lg" icon="grid" block aria-haspopup="dialog" onClick={() => setOpen(true)}>
              Check in
            </Button>
            {shownReceipt && (
              <CheckInReceipt
                key={shownReceipt.id}
                line={shownReceipt.line}
                onUndo={() => undo(shownReceipt)}
                pending={pending}
                holdUndo={holdUndo}
                // The line stays (then the line alone); Undo goes, so its focus moves to Check in, never to <body>.
                onExpire={(hadFocus) => {
                  if (hadFocus) focusFirst(entryRef);
                }}
              />
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="t-error">
            {error}
          </p>
        )}
        <p className="sr-only" role="status">
          {said}
        </p>
        <SafetyLine />

        {showLow && <LowCard onHide={hideLow} pending={pending} />}

        {hasAny ? (
          <div className="mind-trend">
            <div className="mind-trend-h">
              <h3 className="t-eyebrow">Last 14 days</h3>
              <p className="t-meta t-num">{view.countLine}</p>
            </div>
            <MindStrip strip={view.strip} />
            <MindWeeks trend={view.trend} today={view.today} promptedLine={view.promptedLine} />
          </div>
        ) : (
          <p className="t-body mind-empty">{view.storedCount > 0 ? MIND_OLD_ONLY_COPY : MIND_EMPTY_COPY}</p>
        )}
      </section>

      <section className="card pad-l mind-card" aria-labelledby={`${id}-l`}>
        <h2 id={`${id}-l`} className="t-eyebrow mind-eyebrow">
          Your check-ins
        </h2>
        {recent.length > 0 ? (
          <CheckList checks={recent} today={view.today} actions={actions} onGone={gotGone} caption={`The last ${STRIP_DAYS} days, newest first.`} />
        ) : (
          <p className="t-meta">None in the last {STRIP_DAYS} days.</p>
        )}
        {olderCount > 0 && <OlderChecks key={cleared} count={olderCount} today={view.today} actions={actions} gone={gone} onGone={gotGone} />}
        {!paused && <PauseControls onPause={setPaused} pending={pending} />}
        <DeleteAll
          deleteAll={actions.deleteAllChecks}
          onDone={(n) => setSaid(deletedAllLineOf(n))}
          onGone={() => {
            setGone((g) => [...g, ...recent.map((c) => c.id)]);
            setReceipt(null);
            setCleared((k) => k + 1);
          }}
        />
        <p className="t-meta">A record for you, never graded. Not medical advice.</p>
      </section>

      <CheckInSheet
        open={open}
        onClose={() => setOpen(false)}
        via="web"
        refresh
        logCheck={actions.logCheck}
        draft={draft}
        onLogged={(v) => {
          setOpen(false);
          setReceipt(v);
          setError(null);
          setSaid(v.line);
        }}
      />
    </>
  );
}

function LowCard({ onHide, pending }: { onHide: () => void; pending: boolean }) {
  const id = useId();
  return (
    <section className="mind-low sunk" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="mind-low-h">
        {LOW_CARD_TITLE}
      </h3>
      <ul className="mind-contacts">
        {LOW_CARD_CONTACTS.map((c) => (
          <li key={c.label}>
            <a
              className="mind-tel"
              href={`${c.text ? "sms" : "tel"}:${c.contact.tel}`}
              aria-label={c.text ? `Text ${c.contact.name.replace(/ text$/, "")} on ${c.contact.number}` : `Call ${c.contact.name} on ${c.contact.number}`}
            >
              {c.label}
            </a>
          </li>
        ))}
      </ul>
      <p className="t-meta mind-low-p">{LOW_CARD_GP}</p>
      <p className="t-meta mind-low-p">{LOW_CARD_PRIVATE}</p>
      <div>
        <Button variant="quiet" onClick={onHide} disabled={pending}>
          {LOW_CARD_HIDE}
        </Button>
      </div>
    </section>
  );
}

/** One check-in in words: 'Calm, content · Relaxed', then 'Pleasantness +2, energy −1 · Stress: A little · Work'. */
function detailOf(c: MoodCheckView): { head: string; sub: string } {
  const head = [cellWordsOf(c.valence, c.energy), c.word].filter(Boolean).join(" · ");
  const stress = stressLabelOf(c.stress);
  const sub = [`Pleasantness ${signedStep(c.valence)}, energy ${signedStep(c.energy)}`, stress ? `Stress: ${stress}` : null, c.tags.length > 0 ? c.tags.join(", ") : null]
    .filter(Boolean)
    .join(" · ");
  return { head, sub };
}

function CheckList({
  checks,
  today,
  actions,
  onGone,
  caption,
}: {
  checks: readonly MoodCheckView[];
  today: DayKey;
  actions: MindActions;
  onGone: (id: string) => void;
  /** The list's one line above it (what it holds, in what order). */
  caption: string;
}) {
  const id = useId();
  const [armed, setArmed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pending, startTransition] = useTransition();

  function del(c: MoodCheckView) {
    if (armed !== c.id) {
      setArmed(c.id);
      setError(null);
      return;
    }
    startTransition(async () => {
      try {
        const res = await actions.deleteCheck(c.id, REFRESH);
        setArmed(null);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onGone(c.id);
        setSaid(`Deleted the check-in of ${whenOf(c, today)}.`);
      } catch {
        setArmed(null);
        setError(UNREACHABLE);
      }
    });
  }

  return (
    <div className="mind-hist">
      <p id={`${id}-h`} className="t-meta">
        {caption}
      </p>
      <ul className="mind-list" aria-labelledby={`${id}-h`}>
        {checks.map((c) => {
          const d = detailOf(c);
          const when = whenOf(c, today);
          const isArmed = armed === c.id;
          return (
            <li key={c.id} className="mind-item">
              <div className="mind-item-main">
                <span className="mind-item-when t-num">{when}</span>
                <span className="mind-item-what">{d.head}</span>
                <span className="mind-item-sub t-num">{d.sub}</span>
              </div>
              <button
                type="button"
                className={isArmed ? "mind-del mind-armed" : "mind-del"}
                onClick={() => del(c)}
                onBlur={() => setArmed((a) => (a === c.id ? null : a))}
                disabled={pending}
                aria-label={isArmed ? `Delete? Tap again to delete the check-in of ${when}` : `Delete the check-in of ${when}`}
              >
                {isArmed ? "Delete?" : "Delete"}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="t-error">
          {error}
        </p>
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
    </div>
  );
}

/**
 * Every check-in before the 14-day list, each with its own Delete (D8): "Show older" reads OLDER_PAGE at a time,
 * newest first, from the last one shown (a tap, never on render), and the rows land in the same list as the 14 days'.
 */
function OlderChecks({
  count,
  today,
  actions,
  gone,
  onGone,
}: {
  count: number;
  today: DayKey;
  actions: MindActions;
  gone: readonly string[];
  onGone: (id: string) => void;
}) {
  const id = useId();
  const [rows, setRows] = useState<MoodCheckView[]>([]);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [pending, startTransition] = useTransition();
  const shown = rows.filter((c) => !gone.includes(c.id));

  function showOlder() {
    const last = rows.length > 0 ? rows[rows.length - 1] : null;
    setError(null);
    startTransition(async () => {
      try {
        const res = await actions.loadOlderChecks(last ? { at: last.at, id: last.id } : null);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const known = new Set(rows.map((c) => c.id));
        setRows((cur) => [...cur, ...res.value.checks.filter((c) => !known.has(c.id))]);
        setMore(res.value.more);
        setSaid(res.value.checks.length === 0 ? "No older check-ins." : `Showing ${rows.length + res.value.checks.length} older check-ins.`);
      } catch {
        setError(UNREACHABLE);
      }
    });
  }

  return (
    <div className="mind-ctl" role="group" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="t-eyebrow">
        Older check-ins
      </h3>
      <p className="t-meta t-num">{olderLineOf(count)}</p>
      {shown.length > 0 && <CheckList checks={shown} today={today} actions={actions} onGone={onGone} caption="Newest first." />}
      {more ? (
        <div className="mind-ctl-row">
          <Button variant="secondary" onClick={showOlder} disabled={pending}>
            {pending ? "Loading…" : rows.length === 0 ? "Show older" : "Show more"}
          </Button>
        </div>
      ) : (
        rows.length === 0 && <p className="t-meta">No older check-ins.</p>
      )}
      {error && (
        <p role="alert" className="t-error">
          {error}
        </p>
      )}
      <p className="sr-only" role="status">
        {said}
      </p>
    </div>
  );
}

function PauseControls({ onPause, pending }: { onPause: (length: PauseLength) => void; pending: boolean }) {
  return (
    <div className="mind-ctl">
      <h3 className="t-eyebrow">Pause</h3>
      <p className="t-meta">Hides Check in on Today. Your check-ins are kept.</p>
      <div className="mind-ctl-row">
        {(Object.keys(PAUSE_LENGTHS) as PauseLength[]).map((k) => (
          <Button key={k} variant="secondary" onClick={() => onPause(k)} disabled={pending}>
            {PAUSE_LENGTHS[k].label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** "Delete all check-ins" behind its confirm; Body › Mind and the off page (MindOff) both draw it. */
function DeleteAll({ deleteAll, onDone, onGone }: { deleteAll: MindActions["deleteAllChecks"]; onDone: (n: number) => void; onGone: () => void }) {
  const id = useId();
  const [armed, setArmed] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const boxRef = useRef<HTMLDivElement | null>(null);
  const moved = useRef(false);

  // Arming swaps the button for the confirm, and back: focus follows (never on the first render).
  useEffect(() => {
    if (!moved.current) return;
    boxRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [armed]);

  function arm(on: boolean) {
    moved.current = true;
    setArmed(on);
  }

  function run() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await deleteAll(REFRESH);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        arm(false);
        setLine(deletedAllLineOf(res.value.deleted));
        onGone();
        onDone(res.value.deleted);
      } catch {
        setError(UNREACHABLE);
      }
    });
  }

  return (
    <div ref={boxRef} className="mind-ctl">
      {armed ? (
        <div className="mind-confirm" role="group" aria-labelledby={`${id}-q`}>
          <p id={`${id}-q`} className="t-body">
            {DELETE_ALL_CONFIRM}
          </p>
          <div className="mind-ctl-row">
            <Button variant="secondary" onClick={run} disabled={pending}>
              {pending ? "Deleting…" : DELETE_ALL_LABEL}
            </Button>
            <Button variant="quiet" onClick={() => arm(false)} disabled={pending}>
              Keep them
            </Button>
          </div>
        </div>
      ) : (
        <div className="mind-ctl-row">
          <Button
            variant="quiet"
            onClick={() => {
              arm(true);
              setLine(null);
            }}
          >
            {DELETE_ALL_LABEL}
          </Button>
        </div>
      )}
      {line && <p className="t-meta">{line}</p>}
      {error && (
        <p role="alert" className="t-error">
          {error}
        </p>
      )}
    </div>
  );
}
