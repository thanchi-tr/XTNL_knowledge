"use client";

/**
 * The focus runner (redesign › Study › Review › Runner): no shell, max 560,
 * exit top-left, progress on top, answers in the thumb zone, the result
 * panel from the bottom.
 *
 *   top      exit · a segment strip (hatched misses) · "Card n of N · Quest n of 15" · the pts tally
 *   combo    "Combo 3" · the chain · "×1.15 on this card" (the multiplier this card is PAID, xp.ts
 *            comboMultiplier with the modified cap), then "×1.20 next card" after an answer; "capped"
 *            at the ceiling. A boss run shows "need 7 of 9 · 3 so far" instead: its bar drops only
 *            on a correct answer.
 *   card     SessionCard; the result panel is ResultPanel (portalled).
 *
 * Controlled: the parent (WorkspaceView, or the /dev/style fixtures) owns the
 * run and calls the server. This component owns the keyboard, the Escape
 * layer and the motion, all through the gateway (src/lib/motion.ts) and the
 * celebration queue (src/lib/celebrate.ts):
 *   correct   T0 mark: "+6.4" flies from the payout to the tally, which counts up and bumps;
 *             the new chain diamond stamps in (420 ms, stamp ease).
 *   miss      the chain drains right to left, 55 ms a link. No shake, no red flash. It waits.
 *   first deed of the day   T1 chime "Today kept" (the Day ledger's own beat lives on Today).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewAnswer } from "@/lib/verification";
import type { DayKey } from "@/lib/life-day";
import { isTypingTarget } from "@/lib/capture-parse";
import { announce, chime, mark } from "@/lib/celebrate";
import { bump, countTo, DUR, EASE, motionLevel, play } from "@/lib/motion";
import { pushEscapeLayer } from "@/components/capture/layers";
import { FocusMode } from "@/components/shell/FocusMode";
import { Button, IconButton } from "@/components/ui/Button";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Meter, SegmentStrip } from "@/components/ui/Meter";
import { useMotionPref } from "@/components/ui/MotionPrefs";
import { formatAmount, formatNumber } from "@/components/ui/format";
import type { SubmitReviewResult } from "@/app/actions/review";
import { ResultPanel } from "./ResultPanel";
import { SessionCard, multiOptionsOf, type CardPhase } from "./SessionCard";
import { bossView, comboView, keptStreakOf, segmentsOf, type CardResult, type QuestView, type RunCard } from "./review-model";

export type RunPhase =
  | { kind: "ask" }
  | { kind: "pending"; answer: string; picked: string | null }
  | { kind: "answered"; result: SubmitReviewResult; answer: string; picked: string | null }
  | { kind: "error"; message: string };

export interface BossRun {
  fieldId: string;
  name: string;
  need: number;
  total: number;
}

interface Props {
  queue: readonly RunCard[];
  index: number;
  results: readonly CardResult[];
  phase: RunPhase;
  today: DayKey;
  /** The run so far (consecutive correct answers before the current card). */
  combo: number;
  comboCap: number;
  /** Review points this session, exact. */
  tally: number;
  quest: QuestView;
  boss: BossRun | null;
  /** Prefs and motion allow a correct answer to move on by itself. */
  autoAdvance: boolean;
  /** Streak count the day reaches if this session keeps it (the hub's figure + 1), for "Day 24 kept". */
  dayStreakIfKept: number | null;
  onAnswer: (answer: ReviewAnswer, display: string, picked: string | null) => void;
  onNext: () => void;
  onRetry: () => void;
  onRequestExit: () => void;
}

/**
 * A key or tap that belongs to something else: a field being typed in, the
 * capture sheet, or the shared toast and Seal docks (a capture Undo, a removal
 * Undo, a T1 toast) — acting on one of those must never skip a result.
 */
function belongsElsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return isTypingTarget(target) || target.closest("[data-capture-ui], .dock") !== null;
}

const ARM_MS = 220;
const SEGMENT_MAX = 24;
const DRAIN_STEP_MS = 55;

export function ReviewRunner({
  queue,
  index,
  results,
  phase,
  today,
  combo,
  comboCap,
  tally,
  quest,
  boss,
  autoAdvance,
  dayStreakIfKept,
  onAnswer,
  onNext,
  onRetry,
  onRequestExit,
}: Props) {
  const card = queue[Math.min(index, queue.length - 1)] ?? null;
  const tallyRef = useRef<HTMLDivElement | null>(null);
  const tallyValRef = useRef<HTMLSpanElement | null>(null);
  const payRef = useRef<HTMLSpanElement | null>(null);
  const chainRef = useRef<HTMLSpanElement | null>(null);
  const [landed, setLanded] = useState(tally);
  const landedRef = useRef(tally);
  const { motion } = useMotionPref();

  const result = phase.kind === "answered" ? phase.result : null;
  const cap = result?.combo.cap ?? comboCap;
  const view = result ? comboView(result.combo.next, cap, "answered") : comboView(combo, cap, "ask");
  // Enter moves on only once armed (220 ms after the result), so the key that answered cannot also skip it.
  const [armedFor, setArmedFor] = useState<SubmitReviewResult | null>(null);
  const armed = result != null && armedFor === result;
  // A miss drains the chain right to left, one link per 55 ms (Full only; Calm and Still show the end state).
  const [drain, setDrain] = useState<{ of: SubmitReviewResult | null; step: number }>({ of: null, step: 0 });
  const drainFrom = result && !result.correct && motion === "full" ? comboView(result.combo.before, cap, "ask").lit : null;
  const lit = drainFrom != null ? Math.max(view.lit, drainFrom - (drain.of === result ? drain.step : 0)) : view.lit;

  // Escape asks before leaving (the Sheet's own layer sits above this one while it is open).
  const exitRef = useRef(onRequestExit);
  useEffect(() => {
    exitRef.current = onRequestExit;
  }, [onRequestExit]);
  useEffect(() => pushEscapeLayer(() => exitRef.current()), []);

  // The answer lands: arm the Next key after 220 ms, and play the T0 / T1 beats once per result.
  useEffect(() => {
    if (!result || !card) return;
    const armT = window.setTimeout(() => setArmedFor(result), ARM_MS);
    const timers: number[] = [armT];
    const adv = result.outcome.outcome === "advanced" ? result.outcome : null;
    if (adv) {
      const before = landedRef.current;
      const after = tally;
      landedRef.current = after;
      void mark({
        kind: "correct",
        id: `correct:${card.id}:${results.length}`,
        text: `${result.trueFact.headline}. ${formatAmount(adv.pointsAwarded)} review points, ${card.domainName}.`,
        amount: { kind: "pts", value: adv.pointsAwarded },
        from: payRef.current,
        to: tallyRef.current,
      }).then(() => {
        countTo(tallyValRef.current, before, after, { dur: DUR.slow });
        bump(tallyRef.current);
        timers.push(window.setTimeout(() => setLanded(after), motionLevel() === "still" ? 0 : DUR.slow + 20));
      });
      // The new link stamps in.
      const links = chainRef.current?.querySelectorAll("i.on");
      const last = links && links.length > 0 ? links[links.length - 1] : null;
      void play(last, [{ transform: "rotate(45deg) scale(1.8)", opacity: 0 }, { transform: "rotate(45deg) scale(1)", opacity: 1 }], {
        duration: 420,
        delay: 200,
        easing: EASE.stamp,
      });
    } else {
      announce(`Not this time. The answer is ${result.expected}. ${result.trueFact.detail}.`);
      // The combo drains right to left, one link every 55 ms (at once in Calm and Still).
      const from = comboView(result.combo.before, cap, "ask").lit;
      const to = comboView(result.combo.next, cap, "answered").lit;
      for (let k = 1; k <= from - to; k++) timers.push(window.setTimeout(() => setDrain({ of: result, step: k }), k * DRAIN_STEP_MS));
    }
    // The day's first deed, once: a later answer racing its predecessor's after() row cannot chime twice.
    // The streak figure is the detector's own when its day-kept T1 came back (it is not chimed a second time).
    if (result.streakSecured && !results.slice(0, -1).some((r) => r.result.streakSecured)) {
      const n = keptStreakOf(result, dayStreakIfKept);
      chime({
        kind: "day-kept",
        id: `day-kept:${today}`,
        text: n ? `Day ${n} kept` : "Today kept",
        say: `${n ? `Day ${n} kept` : "Today kept"}. Your first deed today was this review.`,
        burstEl: tallyRef.current,
      });
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // Once per result: everything else is read from the result itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  // A new multiple-choice card takes focus on its question (no ring: tabIndex -1), so the
  // keyboard and a screen reader land on it; typed formats autofocus their own input.
  const questionRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (card?.questionType === "MULTI" && index > 0) questionRef.current?.querySelector<HTMLElement>(".rv-q")?.focus({ preventScroll: true });
  }, [index, card?.questionType]);

  // Keys: 1–9 answer a multiple choice; Enter (or Space) moves on once armed.
  const options = useMemo(() => (card ? multiOptionsOf(card) : []), [card]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (belongsElsewhere(e.target)) return;
      if (document.querySelector(".sheet.show, [data-capture-sheet]")) return;
      if (phase.kind === "ask" && card?.questionType === "MULTI") {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, options.length)) {
          e.preventDefault();
          const opt = options[n - 1];
          onAnswer(opt, opt, opt);
        }
        return;
      }
      if (phase.kind === "answered" && armed && (e.key === "Enter" || e.key === " ")) {
        // A focused button already turns Enter/Space into its own click.
        if (e.target instanceof HTMLButtonElement) return;
        e.preventDefault();
        onNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, armed, card, options, onAnswer, onNext]);

  if (!card) return null;

  const cardPhase: CardPhase = phase.kind === "answered" ? "answered" : phase.kind === "pending" ? "pending" : "ask";
  const picked = phase.kind === "answered" || phase.kind === "pending" ? phase.picked : null;
  const hits = results.filter((r) => r.result.correct).length;
  const bv = boss ? bossView(hits, boss.need, boss.total) : null;
  const cardNo = Math.min(index + 1, queue.length);

  return (
    <>
      <div className="rv-run" data-review-session="">
        <FocusMode />
        {/* The top bar (and its h1) steps aside in focus mode; the runner names itself. */}
        <h1 className="sr-only">{boss ? `Encounter: ${boss.name}` : "Review session"}</h1>
        <div className="rv-top">
          <IconButton icon="x" label={boss ? "Retreat from the encounter" : "Leave the session"} onClick={onRequestExit} />
          <div className="rv-prog">
            {queue.length <= SEGMENT_MAX ? (
              <SegmentStrip segs={segmentsOf(results, queue.length, index)} tall label={`Card ${cardNo} of ${queue.length}`} />
            ) : (
              <Meter thin value={results.length / queue.length} label={`Card ${cardNo} of ${queue.length}`} />
            )}
            <div className="lbl">
              <span>
                Card {cardNo} of {queue.length}
              </span>
              {quest.target > 0 && (
                <span>
                  Quest {Math.min(quest.done, quest.target)} of {quest.target}
                </span>
              )}
            </div>
          </div>
          <div className="rv-tally" ref={tallyRef} data-ledger-target="pts">
            <CurrencyGlyph kind="pts" />
            <span className="sr-only">Review points this session: </span>
            <span ref={tallyValRef} className="num">
              {formatNumber(landed)}
            </span>
          </div>
        </div>

        {boss && bv ? (
          <div className="card rv-bossbar">
            <div className="row">
              <b>{boss.name}</b>
              <span className="ink-2 num">{bv.text}</span>
            </div>
            <Meter value={bv.remaining} label={`${boss.name}: ${bv.text}`} className="rv-boss-meter" />
            <p className="t-meta" style={{ marginTop: 6 }}>
              Its bar drops only on a correct answer.
            </p>
          </div>
        ) : (
          <div className="rv-combo">
            <span className="k">
              Combo<b>{view.count}</b>
            </span>
            {view.chain > 0 ? (
              <span className="rv-chain" ref={chainRef} aria-hidden="true">
                {Array.from({ length: view.chain }, (_, i) => (
                  <i key={i} className={i < lit ? "on" : undefined} />
                ))}
              </span>
            ) : (
              <span className="t-meta" style={{ flex: 1 }}>
                The combo pays nothing extra right now.
              </span>
            )}
            <span className="mult">
              <b>{view.text}</b>
              <span>{view.when}</span>
            </span>
          </div>
        )}

        <div ref={questionRef} style={{ display: "contents" }}>
          <SessionCard
            key={`${card.id}:${index}`}
            card={card}
            today={today}
            phase={cardPhase}
            expected={result?.expected ?? null}
            picked={picked}
            onAnswer={(a, display) => onAnswer(a, display, card.questionType === "MULTI" && typeof a === "string" ? a : null)}
          />
        </div>

        {phase.kind === "error" && (
          <div className="rv-alert" role="alert">
            <span>{phase.message}</span>
            <Button variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </div>

      <ResultPanel
        open={phase.kind === "answered"}
        card={card}
        result={result}
        answer={phase.kind === "answered" ? phase.answer : ""}
        autoAdvance={autoAdvance}
        isLast={index + 1 >= queue.length}
        onNext={onNext}
        payRef={payRef}
      />
    </>
  );
}
