"use client";

/**
 * The weekly review, wired (m2-refit.md F14, decision 26): /today/week?view=run.
 * Five skippable steps in the runner (WeekRunner: focus mode, ≤ 560 wide,
 * thumb-zone nav), then the end:
 *
 *   1 The week     server-rendered (the last judged week and the reviewed
 *                  week's settled facts, never a provisional verdict)
 *   2 Inbox        InboxSheet rows and clarifyInbox (Drop keeps its Undo)
 *   3 Goals        GoalsStrip with its Close and Reschedule sheets
 *   4 Owed         one MakeUpCard per open debt (make up, the minimum, undo,
 *                  and Accept the loss when Settings › Days allows it; a
 *                  write-off resolves the card as MakeUpCard's 'written-off',
 *                  never as 'repaid': nothing was repaid)
 *   5 Next week    rest for specific days (declareRest / cancelRest) and the
 *                  daily capacity (CapacityPanel)
 *   end            the week card (its Tier 2 Seal) only when the judge has
 *                  written the reviewed week; otherwise when that happens
 *
 * Finishing (or skipping the last step) writes the done marker once
 * (markWeekReviewed). Progress survives an exit: the step is kept per
 * viewer in localStorage under weekReviewProgressKey, every access in
 * try/catch, read through useSyncExternalStore so the server render (step
 * 1) never mismatches.
 *
 * Every number comes from the server's read of the board (BoardData, the
 * same one Today renders) and the duty actions' answers; nothing is
 * computed here that the server did not price.
 */
import { useCallback, useMemo, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { RestKind } from "@/lib/duty-economy";
import { makeUpCopy, type OwedCard } from "@/lib/duty-view";
import { addDays, type DayKey } from "@/lib/life-day";
import { DAY_EDGE, REVIEW_LAST_STEP, formatDebt, parseReviewStep, weekReviewProgressKey, weekdayShort } from "@/lib/rituals";
import { buildBoard, type BoardData, type InboxChoice } from "@/lib/today-board";
import { announce } from "@/lib/celebrate";
import { acceptLoss, cancelRest, declareRest, doMinimum, makeUp, undoMakeUp, type MakeUpResult } from "@/app/actions/duty";
import { markWeekReviewed } from "@/app/actions/rituals";
import { clarifyInbox, closeGoal, goalProgress, previewGoalClose, rescheduleGoal, setDailyCapacity, unarchiveTask } from "@/app/actions/tasks";
import { presentAll } from "@/components/celebrate/stage";
import { goalClosedNotice, goalRescheduledNotice } from "@/components/today/board-ui";
import { CapacityPanel } from "@/components/today/CapacityTile";
import { GoalCloseSheet, GoalRescheduleSheet, type GoalClosePreview } from "@/components/today/GoalSheets";
import { GoalsStrip } from "@/components/today/GoalsStrip";
import { InboxSheet } from "@/components/today/InboxSheet";
import { UndoToast } from "@/components/today/UndoToast";
import { MakeUpCard, type MakeUp, type MakeUpState } from "@/components/today/m2/MakeUpCard";
import { WEEK_STEPS, WeekCard, WeekRunner } from "@/components/today/m2/WeekRunner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import type { TrackSigil } from "@/components/ui/Icon";
import { ActionError } from "./ActionError";

const REFRESH = { refresh: true } as const;
const OFFLINE = "Couldn't reach the server. Check the connection and try again.";

/** The week card's figures, from the judge's own rows (the page computes them). */
export interface WeekCardData {
  eyebrow: string;
  kept: number;
  total: number;
  /** held: the track's week was held (life-tracks weekMarkOf), shown as Held, never 'not kept'. */
  tracks: { track: TrackSigil; name: string; kept: boolean; held: boolean }[];
  mp: number;
  line: string;
}

/** One day step 5 offers rest for, with what is declared on it and why REST is refused, if it is. */
export interface RestDayOption {
  day: DayKey;
  /** 'Tue 13 Oct'. */
  label: string;
  declared: RestKind | null;
  /** 'Already 2 rest days that week'; null when REST is on offer. */
  refusal: string | null;
}

export interface WeekReviewProps {
  weekKey: string;
  /** 'week of 5 Oct'. */
  weekLabel: string;
  today: DayKey;
  /** The board as Today reads it: the inbox, goals, owed cards and capacity come from here. */
  data: BoardData;
  /** Life counts (isLaunched): goals can be closed. */
  launched: boolean;
  /** Step 1, rendered on the server. */
  stepOne: ReactNode;
  rest: RestDayOption[];
  /** Why no day is offered in step 5 (none left this week, or before the launch day). */
  restNote: string | null;
  end: { kind: "card"; card: WeekCardData } | { kind: "pending"; text: string };
  /** The week already has its done marker. */
  marked: boolean;
}

// ── Per-viewer progress (localStorage, never trusted to exist) ──────────────

function readStep(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? null : parseReviewStep(raw);
  } catch {
    return null;
  }
}

function writeStep(key: string, step: number): void {
  try {
    window.localStorage.setItem(key, String(step));
  } catch {
    // Storage blocked (a private window, site data off): the review simply starts at step 1 next time.
  }
}

function subscribeStorage(cb: () => void): () => void {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

const KIND_WORD: Record<RestKind, string> = { REST: "Rest", SICK: "Sick", VACATION: "Vacation" };

/** One open debt as its MakeUpCard says it. Every figure is the server's (OwedCard). */
function makeUpItemOf(card: OwedCard, today: DayKey): MakeUp {
  // The restore window closes when card.restoreBy (d + 2) ends: 04:00 the day after it.
  const by = `${weekdayShort(addDays(card.restoreBy, 1))} ${DAY_EDGE}`;
  const back =
    card.restoresToday && card.restoresStreak != null && card.restoresStreak > 0
      ? `Made up before ${by}, its streak of ${card.restoresStreak} comes back.`
      : card.restoresToday
        ? `Made up before ${by}, it counts as kept.`
        : "A make-up now clears the debt; the streak stays as it is.";
  return {
    id: card.instanceId,
    owed: card.debtXp,
    when: `${card.title}${card.archived ? " (archived)" : ""} · ${weekdayShort(card.day)}`,
    text: makeUpCopy(card, today) || `${card.title} is still open.`,
    window: back,
    makeUpPrice: card.makeUpXp,
    minimum: card.mvv && card.minimumXp != null ? { label: card.mvv, price: card.minimumXp } : null,
    resolved: { repaid: "Repaid in full.", minimum: "Repaid in full; the minimum holds." },
  };
}

interface Resolved {
  card: OwedCard;
  state: MakeUpState;
  /** The make-up's own words: what it repaid and paid. */
  line: string;
  /** ISO instant the undo closes (the server holds the window); null once an undo was refused. */
  undoUntil: string | null;
}

export function WeekReview(props: WeekReviewProps) {
  const { weekKey, today, data } = props;
  const router = useRouter();
  const progressKey = weekReviewProgressKey(weekKey);
  const stored = useSyncExternalStore(
    subscribeStorage,
    () => readStep(progressKey),
    () => null
  );
  const [chosen, setChosen] = useState<number | null>(null);
  const step = chosen ?? stored ?? 1;
  const [marked, setMarked] = useState(props.marked);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const board = useMemo(() => buildBoard(data), [data]);
  const owed = useMemo(() => data.duty?.owed ?? [], [data]);

  const go = useCallback(
    (next: number) => {
      const s = Math.min(REVIEW_LAST_STEP, Math.max(1, next));
      setChosen(s);
      setError(null);
      setNotice(null);
      writeStep(progressKey, s);
      if (s === REVIEW_LAST_STEP && !marked) {
        setMarked(true);
        void markWeekReviewed().then(
          (res) => {
            if (res.ok) return;
            setMarked(false);
            setError(res.error);
          },
          () => {
            setMarked(false);
            setError(OFFLINE);
          }
        );
      }
    },
    [progressKey, marked]
  );

  /** Runs one write; a refusal or a lost connection is said once, in the step. */
  function act<T>(write: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, done?: (v: T) => void) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let res: { ok: true; value: T } | { ok: false; error: string };
      try {
        res = await write();
      } catch {
        res = { ok: false, error: OFFLINE };
      }
      if (!res.ok) {
        setError(res.error);
        return;
      }
      done?.(res.value);
    });
  }

  // ── Step 2: the inbox ─────────────────────────────────────────────────────
  const [inboxOpen, setInboxOpen] = useState(false);
  const [dropped, setDropped] = useState<{ id: string; title: string; opId: string } | null>(null);
  const goalsForInbox = Object.values(board.goals)
    .flat()
    .map((g) => ({ id: g.template.id, title: g.template.title }));

  function clarify(templateId: string, choice: InboxChoice, parentId?: string) {
    const title = data.templates.find((t) => t.id === templateId)?.title ?? "Inbox item";
    act(
      () => clarifyInbox(templateId, choice, parentId ?? null, REFRESH),
      (v) => {
        if (choice === "drop") setDropped({ id: templateId, title, opId: `${templateId}:${Date.now()}` });
        if (v.href) router.push(v.href);
      }
    );
  }

  function undoDrop() {
    const d = dropped;
    if (!d) return;
    setDropped(null);
    act(() => unarchiveTask(d.id, REFRESH));
  }

  // ── Step 3: goals ─────────────────────────────────────────────────────────
  const [goalClose, setGoalClose] = useState<{ id: string; title: string; preview: GoalClosePreview; error: string | null; open: boolean } | null>(null);
  const [goalClosing, setGoalClosing] = useState(false);
  const [goalResched, setGoalResched] = useState<{ id: string; title: string; error: string | null; open: boolean; nonce: number } | null>(null);
  const [reschedBusy, setReschedBusy] = useState(false);
  const goalTitleOf = (goalId: string) =>
    Object.values(board.goals)
      .flat()
      .find((g) => g.template.id === goalId)?.template.title ?? "Goal";

  function progressGoal(goalId: string) {
    act(
      () => goalProgress(goalId, 1, { ...REFRESH, opId: `${goalId}-${Date.now().toString(36)}` }),
      (v) => presentAll(v.celebrations)
    );
  }

  function loadGoalPreview(goalId: string) {
    const put = (preview: GoalClosePreview) => setGoalClose((c) => (c && c.id === goalId ? { ...c, preview } : c));
    previewGoalClose(goalId).then(
      (res) => put(res.ok ? { state: "ready", payout: res.value } : { state: "error", error: res.error }),
      () => put({ state: "error", error: OFFLINE })
    );
  }

  function openGoalClose(goalId: string) {
    setGoalClose({ id: goalId, title: goalTitleOf(goalId), preview: { state: "loading" }, error: null, open: true });
    loadGoalPreview(goalId);
  }

  function confirmGoalClose() {
    const target = goalClose;
    if (!target || !target.open || target.preview.state !== "ready" || !target.preview.payout || goalClosing) return;
    const shown = target.preview.payout;
    setGoalClosing(true);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof closeGoal>>;
      try {
        res = await closeGoal(target.id, REFRESH);
      } catch {
        res = { ok: false, error: OFFLINE };
      } finally {
        setGoalClosing(false);
      }
      if (!res.ok) {
        const error = res.error;
        setGoalClose((c) => (c && c.id === target.id ? { ...c, error, preview: { state: "loading" } } : c));
        loadGoalPreview(target.id);
        return;
      }
      const v = res.value;
      setGoalClose((c) => (c && c.id === target.id ? { ...c, open: false } : c));
      presentAll(v.celebrations);
      setNotice(goalClosedNotice(target.title, shown, { paid: v.paid, why: v.why }));
    });
  }

  function saveGoalResched(day: string) {
    const target = goalResched;
    if (!target || !target.open || reschedBusy) return;
    setReschedBusy(true);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof rescheduleGoal>>;
      try {
        res = await rescheduleGoal(target.id, day, REFRESH);
      } catch {
        res = { ok: false, error: OFFLINE };
      } finally {
        setReschedBusy(false);
      }
      if (!res.ok) {
        const error = res.error;
        setGoalResched((c) => (c && c.id === target.id ? { ...c, error } : c));
        return;
      }
      setGoalResched((c) => (c && c.id === target.id ? { ...c, open: false } : c));
      setNotice(goalRescheduledNotice(target.title, res.value.dueDay, today));
    });
  }

  // ── Step 4: owed ──────────────────────────────────────────────────────────
  const [resolved, setResolved] = useState<Record<string, Resolved>>({});
  const openIds = new Set(owed.map((c) => c.instanceId));
  const cards: OwedCard[] = [...owed, ...Object.values(resolved).filter((r) => !openIds.has(r.card.instanceId)).map((r) => r.card)];
  const stillOwed = owed.filter((c) => !resolved[c.instanceId]);
  const openDebt = stillOwed.reduce((s, c) => s + c.debtXp, 0);

  /** 'Accept the loss': the card resolves as written off (quiet chip, the DEBT row stays), never as repaid. */
  function wroteOff(card: OwedCard) {
    setResolved((r) => ({ ...r, [card.instanceId]: { card, state: "written-off", line: "", undoUntil: null } }));
    announce("Written off. The miss stays on the ledger.");
  }

  function made(card: OwedCard, v: MakeUpResult) {
    const back = v.restored ? (v.status === "DONE_MVV" ? "its streak holds" : "its streak is back") : "its streak stays as it was";
    const line = `Repaid ${formatDebt(v.debtXp)} and paid ${formatDebt(v.xp)}; ${back}.`;
    setResolved((r) => ({ ...r, [card.instanceId]: { card, state: v.status === "DONE_MVV" ? "minimum" : "repaid", line, undoUntil: v.undoUntil } }));
    announce(v.clearedLast ? "Made up. Nothing is owed." : `Made up. ${v.owedLeft} still owed.`);
  }

  function undo(card: OwedCard) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof undoMakeUp>>;
      try {
        res = await undoMakeUp(card.instanceId, REFRESH);
      } catch {
        res = { ok: false, error: OFFLINE };
      }
      if (!res.ok) {
        // Past its window (or settled): the make-up stands, and the button goes.
        setError(res.error);
        setResolved((r) => (r[card.instanceId] ? { ...r, [card.instanceId]: { ...r[card.instanceId], undoUntil: null } } : r));
        return;
      }
      setResolved((r) => {
        const next = { ...r };
        delete next[card.instanceId];
        return next;
      });
      announce("Make-up undone. The debt is open again.");
    });
  }

  // ── Step 5: next week ─────────────────────────────────────────────────────
  const [capacityBusy, setCapacityBusy] = useState(false);

  function setCapacity(minutes: number) {
    setCapacityBusy(true);
    act(
      async () => {
        try {
          return await setDailyCapacity(minutes, REFRESH);
        } finally {
          setCapacityBusy(false);
        }
      },
      (v) => setNotice(`Daily capacity set to ${v.minutes} minutes.`)
    );
  }

  // ── The steps ─────────────────────────────────────────────────────────────
  const inboxCount = board.inbox.length;
  const goalCount = Object.values(board.goals).flat().length;
  const busy = pending;
  const feedback = (
    <>
      {error && <ActionError>{error}</ActionError>}
      {notice && (
        <p className="t-meta" role="status">
          {notice}
        </p>
      )}
    </>
  );

  let body: ReactNode;
  if (step === 1) {
    body = props.stepOne;
  } else if (step === 2) {
    body = (
      <>
        <p className="t-eyebrow">{WEEK_STEPS[1]}</p>
        <h1>{inboxCount === 0 ? "The inbox is clear." : `${inboxCount} ${inboxCount === 1 ? "line" : "lines"} to sort.`}</h1>
        <p className="t-meta">One tap each: today, tomorrow, anytime, a goal, an idea, or drop it. Nothing here is owed.</p>
        {inboxCount > 0 && (
          <div>
            <Button variant="secondary" onClick={() => setInboxOpen(true)} aria-haspopup="dialog">
              Sort the inbox
            </Button>
          </div>
        )}
        {dropped && !inboxOpen && <UndoToast id={dropped.opId} verb="Dropped" title={dropped.title} onUndo={undoDrop} />}
        {feedback}
      </>
    );
  } else if (step === 3) {
    body = (
      <>
        <p className="t-eyebrow">{WEEK_STEPS[2]}</p>
        <h1>{goalCount === 0 ? "No open goals." : "Check in on your goals."}</h1>
        <p className="t-meta">Log progress, reschedule one carried past its day, or close one that is done. A carried goal is never owed.</p>
        <GoalsStrip
          goals={board.goals}
          busy={busy || goalClosing || reschedBusy}
          onProgress={progressGoal}
          launched={props.launched}
          onClose={props.launched ? openGoalClose : undefined}
          onReschedule={(id) => setGoalResched((c) => ({ id, title: goalTitleOf(id), error: null, open: true, nonce: (c?.nonce ?? 0) + 1 }))}
        />
        {feedback}
      </>
    );
  } else if (step === 4) {
    const left = stillOwed.length;
    body = (
      <>
        <p className="t-eyebrow">{WEEK_STEPS[3]}</p>
        <h1>{left === 0 ? "Nothing is owed." : `${left} owed · −${formatDebt(openDebt)}`}</h1>
        <p className="t-meta">A make-up repays a debt in full. Leaving one costs nothing more: it never grows.</p>
        {cards.length > 0 && (
          <div className="card">
            {cards.map((card) => {
              const r = resolved[card.instanceId];
              const item = makeUpItemOf(card, today);
              const canUndo = r?.undoUntil != null;
              return (
                <MakeUpCard
                  key={card.instanceId}
                  item={r && r.state !== "written-off" ? { ...item, resolved: { repaid: r.line, minimum: r.line } } : item}
                  state={r?.state ?? "open"}
                  busy={busy}
                  onMakeUp={() => act(() => makeUp(card.instanceId, REFRESH), (v) => made(card, v))}
                  onMinimum={item.minimum ? () => act(() => doMinimum(card.instanceId, REFRESH), (v) => made(card, v)) : undefined}
                  onAcceptLoss={card.canWriteOff ? () => act(() => acceptLoss(card.instanceId, REFRESH), () => wroteOff(card)) : undefined}
                >
                  {canUndo && (
                    <div style={{ padding: "0 12px 12px 16px" }}>
                      <Button variant="quiet" disabled={busy} onClick={() => undo(card)}>
                        Undo the make-up
                      </Button>
                    </div>
                  )}
                </MakeUpCard>
              );
            })}
          </div>
        )}
        {feedback}
      </>
    );
  } else if (step === 5) {
    const view = board;
    body = (
      <>
        <p className="t-eyebrow">{WEEK_STEPS[4]}</p>
        <h1>Plan the shape of the week.</h1>
        <p className="t-meta">A rest day is declared before it starts. It owes nothing and holds every streak.</p>
        {props.rest.length > 0 ? (
          <div className="card y-list" style={{ padding: "0 14px" }}>
            {props.rest.map((o) => (
              <div key={o.day} className="y-row">
                <div className="n">
                  <b>{o.label}</b>
                  <span>{o.declared ? `${KIND_WORD[o.declared]} · declared` : o.refusal ?? "An ordinary day"}</span>
                </div>
                {o.declared ? (
                  <>
                    <Chip tone="held" held={o.declared === "VACATION" ? "away" : o.declared === "SICK" ? "sick" : "rest"}>
                      {KIND_WORD[o.declared]}
                    </Chip>
                    <Button variant="quiet" disabled={busy} onClick={() => act(() => cancelRest(o.day, undefined, REFRESH))}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" disabled={busy || !!o.refusal} onClick={() => act(() => declareRest(o.day, REFRESH))}>
                    Rest
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          props.restNote && <p className="t-meta">{props.restNote}</p>
        )}
        <section aria-label="Daily capacity" className="card" style={{ padding: 14 }}>
          <CapacityPanel
            planned={view.planned}
            capacity={view.capacity}
            over={view.over}
            chosen={data.capacitySet === true}
            suggestion={null}
            today={today}
            busy={busy}
            settingBusy={capacityBusy}
            onMove={() => undefined}
            onSetCapacity={setCapacity}
          />
        </section>
        {feedback}
      </>
    );
  } else {
    body = (
      <>
        {props.end.kind === "card" ? (
          <WeekCard {...props.end.card} what={[]} sweep />
        ) : (
          <>
            <p className="t-eyebrow">Weekly review · {props.weekLabel}</p>
            <h1>Reviewed.</h1>
            <p className="t-meta">{props.end.text}.</p>
          </>
        )}
        {feedback}
        <div>
          <Button variant="quiet" onClick={() => go(1)}>
            Go through it again
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <WeekRunner step={step} onNext={() => go(step + 1)} onSkip={() => go(step + 1)} exitHref="/today">
        {body}
      </WeekRunner>

      <InboxSheet
        open={inboxOpen}
        items={board.inbox}
        goals={goalsForInbox}
        busy={busy}
        onClarify={clarify}
        onClose={() => setInboxOpen(false)}
        undo={dropped && inboxOpen ? <UndoToast id={dropped.opId} verb="Dropped" title={dropped.title} onUndo={undoDrop} /> : null}
      />

      <GoalCloseSheet
        open={!!goalClose?.open}
        title={goalClose?.title ?? "Goal"}
        preview={goalClose?.preview ?? { state: "loading" }}
        busy={goalClosing}
        error={goalClose?.error ?? null}
        onConfirm={confirmGoalClose}
        onClose={() => {
          if (!goalClosing) setGoalClose((c) => (c ? { ...c, open: false } : c));
        }}
      />

      <GoalRescheduleSheet
        open={!!goalResched?.open}
        formKey={goalResched?.nonce ?? 0}
        title={goalResched?.title ?? "Goal"}
        today={today}
        busy={reschedBusy}
        error={goalResched?.error ?? null}
        onSave={saveGoalResched}
        onClose={() => {
          if (!reschedBusy) setGoalResched((c) => (c ? { ...c, open: false } : c));
        }}
      />
    </>
  );
}
