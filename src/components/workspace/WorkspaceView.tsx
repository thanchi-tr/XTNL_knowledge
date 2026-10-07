"use client";

/**
 * Study › Review: the hub, the focus runner and the recap, on one route.
 *
 * The runner's mode lives in the URL (?view=run, then ?view=recap), written
 * with the native history API, which Next's router syncs into
 * useSearchParams without a server round trip or a remount — so the run's
 * state survives, and the browser's Back button exits the run. A reload of
 * ?view=run starts the same run again (the order is seeded by the life day
 * and the scope, so the server render and the browser agree); a reload of
 * ?view=recap has nothing to show and lands on the hub.
 *
 * Every answer goes to submitReview (graded and priced on the server). The
 * run is wrapped in celebrate.ts openRun/closeRun: T2 Seals that L3's
 * detectors return merge into the run (in the result panel and the recap,
 * marked seen there), T3s wait until the run closes. The detectors' T1s are
 * not chimed again: the runner and the recap play the run's own T1s.
 */
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { submitReview } from "@/app/actions/review";
import { chooseBossBoon, resolveBossEncounter, startBossEncounter } from "@/app/actions/bosses";
import type { BossResolution, BossState } from "@/lib/bosses";
import { BOON_KINDS, BOON_META, type BoonKind } from "@/lib/boon-meta";
import { autoAdvances, type CelebrationEvent } from "@/lib/celebration-types";
import { closeRun, enqueue, openRun } from "@/lib/celebrate";
import type { DayKey } from "@/lib/life-day";
import { formatExpiry } from "@/lib/format-date";
import type { ReviewAnswer } from "@/lib/verification";
import { useStreak } from "@/components/StreakProvider";
import { useMotionPref } from "@/components/ui/MotionPrefs";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { pushToast } from "@/components/ui/toast-store";
import { ackShown } from "@/components/celebrate/stage";
import { BossPanel } from "./BossPanel";
import { BossResult, BoonChoice } from "./BossResult";
import { EffectsCard, RecentIdeas, type RecentIdea, type ReviewEffects } from "./ReviewHub";
import { ReviewRunner, type BossRun, type RunPhase } from "./ReviewRunner";
import { SessionComplete } from "./SessionComplete";
import { ALL_FIELDS, SessionSummary } from "./SessionSummary";
import { celebrationRoute, dayKeptOf, questNow, seededOrder, tallyOf, type CardResult, type RunCard } from "./review-model";
import { RoadmapFocus } from "./RoadmapFocus";
import type { StudyFocus, StudyTopic } from "@/lib/roadmap-study";
import "./review.css";

export interface WorkspaceField {
  id: string;
  name: string;
  /** Due cards in this field, question side only. */
  cards: RunCard[];
}

interface Props {
  fields: WorkspaceField[];
  totalDue: number;
  bosses: BossState[];
  /** What is coming when nothing more is due today ("9 tomorrow"). */
  upcoming: { label: string; count: number } | null;
  /** Ideas that exist but are not due. Zero means the library is empty, which is a different problem. */
  scheduledCount: number;
  /** Today's review quest at page load (capped at REVIEW_QUEST_CARDS). */
  quest: { done: number; target: number };
  /** The combo's modified ceiling, until the first answer brings the server's. */
  comboCap: number;
  today: DayKey;
  /** The day is already kept (something counted today), and the daily streak. */
  dayKept: boolean;
  dayStreak: number;
  /** L4's loadout strip (src/components/skills/LoadoutStrip), rendered by the server page; null before the first emblem. */
  loadoutStrip: ReactNode;
  /** What changes a review right now: the folded modifiers, boons and penalties. */
  effects: ReviewEffects;
  recent: RecentIdea[];
  /** The accepted roadmap's open layer and its one topic now (ruling N14); null without one. */
  focus?: StudyFocus | null;
}

type Settled = Exclude<BossResolution, { outcome: "rejected" }>;

interface Run {
  id: string;
  queue: RunCard[];
  index: number;
  results: CardResult[];
  phase: RunPhase;
  boss: BossRun | null;
  questStart: { done: number; target: number };
  startedAt: number;
  endedAt: number | null;
  merged: CelebrationEvent[];
  bossResolution: Settled | null;
  bossNote: string | null;
  /** What was due when the run began (the recap's "cleared" and "still due" read this, not later props). */
  dueStart: { total: number; byField: [string, string[]][] };
}

type Mode = "hub" | "run" | "recap";

function cardsIn(fields: WorkspaceField[], scope: string): RunCard[] {
  return fields.filter((f) => scope === ALL_FIELDS || f.name === scope).flatMap((f) => f.cards);
}

function newRun(fields: WorkspaceField[], scope: string, today: DayKey, quest: { done: number; target: number }, totalDue: number): Run {
  return {
    id: `run:${today}:${scope}`,
    queue: seededOrder(cardsIn(fields, scope), `${today}:${scope}`),
    index: 0,
    results: [],
    phase: { kind: "ask" },
    boss: null,
    questStart: quest,
    startedAt: Date.now(),
    endedAt: null,
    merged: [],
    bossResolution: null,
    bossNote: null,
    dueStart: { total: totalDue, byField: fields.map((f) => [f.name, f.cards.map((c) => c.id)]) },
  };
}

export function WorkspaceView(props: Props) {
  const { fields, totalDue, bosses: allBosses, upcoming, scheduledCount, quest, comboCap, today, dayKept, dayStreak, loadoutStrip, effects, recent, focus = null } = props;
  // Ruling N14: the roadmap's Field leads (its chip selected while it has cards due, its encounter first).
  const focusField = focus?.fieldName && fields.some((f) => f.name === focus.fieldName && f.cards.length > 0) ? focus.fieldName : null;
  const bosses = focus?.fieldId ? [...allBosses].sort((a, b) => Number(b.fieldId === focus.fieldId) - Number(a.fieldId === focus.fieldId)) : allBosses;
  const router = useRouter();
  const pathname = usePathname();
  const view = useSearchParams().get("view");
  const { streak, recordResult } = useStreak();
  const { prefs, motion } = useMotionPref();

  const resumable = view === "run" && totalDue > 0;
  const [mode, setMode] = useState<Mode>(resumable ? "run" : "hub");
  const [run, setRun] = useState<Run | null>(() => (resumable ? newRun(fields, ALL_FIELDS, today, quest, totalDue) : null));
  const [selected, setSelected] = useState<string>(focusField ?? ALL_FIELDS);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [boonFor, setBoonFor] = useState<string | null>(null);
  const [bossError, setBossError] = useState<string | null>(null);
  const [pendingBoss, setPendingBoss] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const pushedRef = useRef(false);
  // Set synchronously, so a double tap (or "1" pressed twice) can never submit one card twice.
  const submittingRef = useRef(false);
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  // A run opened by a reload of ?view=run joins the celebration queue once mounted; any run closes on unmount.
  useEffect(() => {
    if (runRef.current && runRef.current.endedAt == null) openRun(runRef.current.id);
    if (view === "recap") window.history.replaceState(null, "", pathname);
    return () => {
      closeRun();
    };
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toHub(refresh = true) {
    closeRun();
    setRun(null);
    setMode("hub");
    setConfirmOpen(false);
    if (refresh) router.refresh();
  }

  // The browser's Back button out of ?view=run or ?view=recap returns to the hub.
  const prevView = useRef(view);
  useEffect(() => {
    const prev = prevView.current;
    prevView.current = view;
    const wasIn = prev === "run" || prev === "recap";
    const isIn = view === "run" || view === "recap";
    if (wasIn && !isIn && mode !== "hub") {
      pushedRef.current = false;
      toHub();
    }
    // toHub only reads refs and setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function enter(next: Run) {
    openRun(next.id);
    setRun(next);
    setMode("run");
    window.history.pushState(null, "", "?view=run");
    pushedRef.current = true;
    window.scrollTo(0, 0);
  }

  function start() {
    const next = newRun(fields, selected, today, quest, totalDue);
    if (next.queue.length === 0) return;
    enter(next);
  }

  /** The focus topic's due cards, one tap (ruling N14). */
  function reviewTopic(topic: StudyTopic) {
    const base = newRun(fields, ALL_FIELDS, today, quest, totalDue);
    const cards = fields.flatMap((f) => f.cards).filter((c) => c.domainId === topic.domainId);
    if (cards.length === 0) return;
    enter({ ...base, id: `topic:${today}:${topic.domainId}`, queue: seededOrder(cards, `${today}:${topic.domainId}`) });
  }

  function challenge(fieldId: string) {
    setBossError(null);
    setPendingBoss(fieldId);
    startTransition(async () => {
      const res = await startBossEncounter(fieldId).catch(() => ({ ok: false as const, error: "Could not open the encounter. Try again." }));
      setPendingBoss(null);
      if (!res.ok) {
        setBossError(res.error);
        return;
      }
      const boss = bosses.find((b) => b.fieldId === fieldId);
      const queue: RunCard[] = res.value.cards.map((c) => ({ ...c, lastSeenDay: null, overdue: false }));
      enter({
        ...newRun(fields, ALL_FIELDS, today, quest, totalDue),
        id: `boss:${fieldId}:${Date.now()}`,
        queue,
        boss: { fieldId, name: boss?.archetype.name ?? "The encounter", need: boss?.needCorrect ?? queue.length, total: queue.length },
      });
    });
  }

  function setPhase(phase: RunPhase) {
    setRun((r) => (r ? { ...r, phase } : r));
  }

  function answer(userAnswer: ReviewAnswer, display: string, picked: string | null) {
    const r = runRef.current;
    if (submittingRef.current || !r || (r.phase.kind !== "ask" && r.phase.kind !== "error")) return;
    const card = r.queue[r.index];
    if (!card) return;
    submittingRef.current = true;
    setPhase({ kind: "pending", answer: display, picked });
    startTransition(async () => {
      try {
        const result = await submitReview({ ideaId: card.id, userAnswer, combo: streak });
        recordResult(result.combo.next);
        setRun((cur) =>
          cur && cur.id === r.id
            ? { ...cur, results: [...cur.results, { card, result, answer: display }], phase: { kind: "answered", result, answer: display, picked } }
            : cur
        );
        // T2 merges into this run; T3 waits for it to close. T1s are the runner's own (one "Today kept", not two).
        for (const ev of result.celebrations) if (celebrationRoute(ev) === "enqueue") enqueue(ev);
      } catch {
        setPhase({ kind: "error", message: "No reply from the server for that answer. Check the connection and try again." });
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function finish(opts: { retreat?: boolean } = {}) {
    const r = runRef.current;
    if (!r) return;
    const merged = closeRun();
    // Seen: the in-panel Seals acked themselves; the recap lists the rest. A backstop for the recap's own ack.
    ackShown(merged);
    const endedAt = Date.now();
    setRun({ ...r, merged, endedAt, bossNote: opts.retreat && r.boss ? "Retreated: the encounter is forfeit. The cards answered were real reviews and stay paid." : null });
    setMode("recap");
    setConfirmOpen(false);
    window.history.replaceState(null, "", "?view=recap");
    window.scrollTo(0, 0);
    if (r.boss && !opts.retreat) {
      const boss = r.boss;
      const t = tallyOf(r.results);
      startTransition(async () => {
        const res = await resolveBossEncounter(boss.fieldId, t.correct, t.answered).catch(() => ({ ok: false as const, error: "The verdict did not arrive. Your answers were saved." }));
        if (!res.ok) {
          setRun((cur) => (cur ? { ...cur, bossNote: res.error } : cur));
          return;
        }
        setRun((cur) => (cur ? { ...cur, bossResolution: res.value.resolution as Settled } : cur));
        // The run is closed: a "boss won" Seal plays at the dock through L3's presenter.
        for (const ev of res.value.celebrations) if (celebrationRoute(ev) === "enqueue") enqueue(ev);
      });
    }
  }

  function next() {
    const r = runRef.current;
    if (!r || r.phase.kind !== "answered") return;
    if (r.index + 1 >= r.queue.length) finish();
    else setRun({ ...r, index: r.index + 1, phase: { kind: "ask" } });
  }

  function requestExit() {
    const r = runRef.current;
    if (!r) return;
    if (r.results.length === 0) leave();
    else setConfirmOpen(true);
  }

  function leave() {
    const r = runRef.current;
    if (r && r.results.length > 0) {
      finish({ retreat: true });
      return;
    }
    backToHub();
  }

  function backToHub() {
    if (pushedRef.current) {
      // Pops ?view=… — the Back handler above returns to the hub.
      window.history.back();
      return;
    }
    window.history.replaceState(null, "", pathname);
    toHub();
  }

  async function claimBoon(fieldId: string, kind: BoonKind): Promise<string | null> {
    const res = await chooseBossBoon(fieldId, kind);
    if (!res.ok) return res.error;
    pushToast({ title: `${BOON_META[kind].label} is on`, body: `${BOON_META[kind].effectText(res.value.magnitude)} until ${formatExpiry(res.value.expiresAt)}.`, key: `boon:${fieldId}` });
    router.refresh();
    return null;
  }

  // Enter starts a review from the hub when nothing else has focus.
  useEffect(() => {
    if (mode !== "hub" || totalDue === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const a = document.activeElement;
      if (a && a !== document.body && a.id !== "main") return;
      if (document.querySelector(".sheet.show, [data-capture-sheet]")) return;
      e.preventDefault();
      start();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── Runner ──
  if (mode === "run" && run) {
    const answered = run.results.length;
    return (
      <>
        <ReviewRunner
          queue={run.queue}
          index={run.index}
          results={run.results}
          phase={run.phase}
          today={today}
          combo={streak}
          comboCap={comboCap}
          tally={tallyOf(run.results).pts}
          quest={questNow(run.questStart, run.results)}
          boss={run.boss}
          autoAdvance={autoAdvances(prefs, motion)}
          dayStreakIfKept={dayKept ? null : dayStreak + 1}
          onAnswer={answer}
          onNext={next}
          onRetry={() => setPhase({ kind: "ask" })}
          onRequestExit={requestExit}
        />
        <Sheet
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          title={run.boss ? "Retreat from the encounter?" : "Leave the session?"}
          description={
            run.boss
              ? `The encounter is forfeit: no victory, no defeat, no debuff. The ${answered} answered ${answered === 1 ? "is" : "are"} saved and paid.`
              : `${answered} answered ${answered === 1 ? "is" : "are"} saved and paid. The rest stay due; nothing is lost.`
          }
          footer={
            <>
              <Button variant="primary" size="lg" style={{ flex: 1 }} onClick={() => setConfirmOpen(false)} data-autofocus="">
                Keep going
              </Button>
              <Button variant="secondary" size="lg" onClick={leave}>
                {run.boss ? "Retreat" : "Leave"}
              </Button>
            </>
          }
        />
      </>
    );
  }

  // ── Recap ──
  if (mode === "recap" && run) {
    const answeredIds = new Set(run.results.map((r) => r.card.id));
    const dueIds = new Set(run.dueStart.byField.flatMap(([, ids]) => ids));
    const fieldsCleared = run.dueStart.byField
      .filter(([, ids]) => ids.length > 0 && ids.every((id) => answeredIds.has(id)))
      .map(([name]) => name);
    const remainingDue = Math.max(0, run.dueStart.total - [...answeredIds].filter((id) => dueIds.has(id)).length);
    const settled = run.bossResolution;
    const bossNode =
      run.boss && (settled || run.bossNote) ? (
        settled ? (
          <BossResult resolution={settled} fieldId={run.boss.fieldId} onChoose={(k) => claimBoon(run.boss!.fieldId, k)} />
        ) : (
          <section className="card pad-l">
            <div className="t-eyebrow">{run.boss.name}</div>
            <p className="t-meta ink-1" style={{ marginTop: 4 }}>
              {run.bossNote}
            </p>
          </section>
        )
      ) : run.boss ? (
        <section className="card pad-l" aria-busy="true">
          <div className="t-eyebrow">{run.boss.name}</div>
          <p className="t-meta" style={{ marginTop: 4 }}>
            Judging the encounter…
          </p>
        </section>
      ) : undefined;
    return (
      <SessionComplete
        results={run.results}
        merged={run.merged}
        questBefore={questNow(run.questStart, [])}
        questAfter={questNow(run.questStart, run.results)}
        startedAt={run.startedAt}
        endedAt={run.endedAt ?? Date.now()}
        dayKept={dayKeptOf(run.results, dayKept ? null : dayStreak + 1)}
        remainingDue={remainingDue}
        upcoming={upcoming}
        fieldsCleared={run.boss ? [] : fieldsCleared}
        today={today}
        boss={bossNode}
        onBackToReview={backToHub}
      />
    );
  }

  // ── Hub ──
  const hubFields = fields.map((f) => ({ id: f.id, name: f.name, due: f.cards.length }));
  const scopeDue = selected === ALL_FIELDS ? totalDue : (hubFields.find((f) => f.name === selected)?.due ?? 0);
  const boonBoss = boonFor ? bosses.find((b) => b.fieldId === boonFor) : null;
  return (
    <div className="page cq-main">
      <div className="rv-hub">
        <div className="rv-col">
          {focus && <RoadmapFocus focus={focus} onReview={reviewTopic} />}
          <SessionSummary
            quest={quest}
            dueCount={scopeDue}
            totalDue={totalDue}
            fields={hubFields}
            selected={selected}
            onSelect={setSelected}
            onStart={start}
            scheduledCount={scheduledCount}
            upcoming={upcoming}
          />
          {loadoutStrip}
          <EffectsCard effects={effects} />
        </div>
        <div className="rv-col">
          <BossPanel bosses={bosses} onChallenge={challenge} onChooseBoon={setBoonFor} pendingFieldId={pendingBoss} error={bossError} />
          <RecentIdeas ideas={recent} />
        </div>
      </div>
      <Sheet
        open={boonBoss != null && boonBoss.pendingBoon != null}
        onClose={() => setBoonFor(null)}
        title="Choose your boon"
        description={boonBoss ? `${boonBoss.fieldName}: one boon for this victory. There is no wrong choice.` : undefined}
      >
        {boonBoss?.pendingBoon && (
          <BoonChoice choices={[...BOON_KINDS]} claimUntil={boonBoss.pendingBoon.claimUntil} onChoose={(k) => claimBoon(boonBoss.fieldId, k)} />
        )}
      </Sheet>
    </div>
  );
}
