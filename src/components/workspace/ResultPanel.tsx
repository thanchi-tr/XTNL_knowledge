"use client";

/**
 * The result panel (redesign › Study › Review › Result panel).
 *
 * Correct: the true fact (review-facts.ts, never a random affirmation), the
 * exact payout "+6.4 review pts · +0.6 MP", its formula in mono
 * ("2.36 base × 1.15 combo × 1.20 yield = 3.26"), the domain meter growing
 * from its old value to its new one in the currency that fed it, any Seal
 * inline (L3's <SealCard inline announce/>: no button of its own; it marks
 * the moment seen when it mounts, so it never replays as a docked Seal on
 * the next load or the other device, and — because a Seal merged into the
 * run skips the queue's presenter — it plays its own sound, haptic and
 * sentence once per id), and Next card with a 1.8 s countdown
 * hairline when auto-advance is on (never in Still; the pointer entering
 * the panel cancels it). A hold is a ceiling, never a toll.
 *
 * Miss: "Not this time", the strike count and what (if anything) was
 * taken, You chose / The answer / why, the combo line — and it waits.
 *
 * Portalled to <body>: a fixed layer never renders inside <main>.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { SealCard } from "@/components/celebrate/SealCard";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Medallion } from "@/components/ui/Crest";
import { CurrencyGlyph, Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { useMotionPref } from "@/components/ui/MotionPrefs";
import { cx } from "@/components/ui/cx";
import { formatAmount, formatNumber } from "@/components/ui/format";
import type { SubmitReviewResult } from "@/app/actions/review";
import { medallionMaterial } from "@/lib/materials";
import { play } from "@/lib/motion";
import { formulaOf, sealsOf, type RunCard } from "./review-model";

export const AUTO_ADVANCE_MS = 1800;

interface Props {
  open: boolean;
  card: RunCard | null;
  result: SubmitReviewResult | null;
  /** What the player answered, readable. */
  answer: string;
  /** Prefs and motion allow a correct answer to move on by itself (celebration-types autoAdvances). */
  autoAdvance: boolean;
  isLast: boolean;
  onNext: () => void;
  /** Where the "+N" token takes off from (the runner flies it to the session tally). */
  payRef?: RefObject<HTMLSpanElement | null>;
}

const noSubscribe = () => () => undefined;

export function ResultPanel({ open, card: cardNow, result: resultNow, answer: answerNow, autoAdvance, isLast, onNext, payRef }: Props) {
  // The portal exists only in the browser; false on the server and during hydration, so the two agree.
  const isClient = useSyncExternalStore(noSubscribe, () => true, () => false);
  // While the panel slides away, it keeps showing the result it slid in with.
  const [kept, setKept] = useState<{ card: RunCard; result: SubmitReviewResult; answer: string } | null>(null);
  if (resultNow && cardNow && kept?.result !== resultNow) setKept({ card: cardNow, result: resultNow, answer: answerNow });
  const shown = resultNow && cardNow ? { card: cardNow, result: resultNow, answer: answerNow } : kept;
  const card = shown?.card ?? null;
  const result = shown?.result ?? null;
  const answer = shown?.answer ?? "";
  const { motion } = useMotionPref();
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const hairRef = useRef<HTMLElement | null>(null);
  // The pointer entering the panel cancels this result's countdown (a hold is a ceiling, never a toll).
  const [pausedFor, setPausedFor] = useState<SubmitReviewResult | null>(null);
  const advanced = result?.outcome.outcome === "advanced" ? result.outcome : null;
  const seals = sealsOf(result);
  // A miss always waits; so does a Seal or a mastery, which are read, not glanced at.
  const holds = !result?.correct || seals.length > 0 || advanced?.mastered === true;
  const runAuto = open && autoAdvance && !holds && pausedFor !== result;

  // Focus the one action once the panel is up (after the 220 ms arm), without scrolling.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => nextRef.current?.focus({ preventScroll: true }), 230);
    return () => window.clearTimeout(t);
  }, [open, result]);

  // The countdown: a hairline and a timer. Cancelled by the pointer entering the panel.
  useEffect(() => {
    if (!runAuto) return;
    void play(hairRef.current, [{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], { duration: AUTO_ADVANCE_MS, easing: "linear" });
    const t = window.setTimeout(onNext, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
    // onNext is re-created by the parent each render; the timer belongs to this result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runAuto, result]);

  if (!isClient) return null;

  const nextLabel = isLast ? "See the recap" : result?.correct ? "Next card" : "Continue";

  return createPortal(
    <div
      className={cx("rv-panel", open && "show")}
      role="region"
      aria-label="Result"
      aria-hidden={open ? undefined : true}
      inert={!open}
      onPointerEnter={() => {
        if (runAuto) setPausedFor(result);
      }}
    >
      {result && card && (
        <div className="rv-panel-in" data-review-session="">
          {result.correct ? (
            <>
              <div className="rv-head">
                <span className="rv-badge kept" aria-hidden="true">
                  <Icon name="check" />
                </span>
                <div className="t">
                  <h3>{result.trueFact.headline}</h3>
                  {result.trueFact.detail && <p>{result.trueFact.detail}</p>}
                </div>
              </div>
              {result.judged && (
                <p className="t-meta ink-1 rv-judged">
                  Accepted on meaning{result.judged.reason ? `: ${result.judged.reason}` : "."}
                </p>
              )}
              {advanced && (
                <>
                  <div className="rv-pay">
                    <span className="big" ref={payRef}>
                      <CurrencyGlyph kind="pts" />
                      <b>{formatAmount(advanced.pointsAwarded)}</b>
                      <span className="t-meta">review pts</span>
                    </span>
                    {advanced.masteryMinted > 0 && <Amount kind="mp" value={advanced.masteryMinted} label="MP" className="ink-1" />}
                  </div>
                  <div className="rv-formula t-mono">{formulaOf(advanced.payout)}</div>
                  <DomainMeter outcome={advanced} />
                  {seals.map((ev) => (
                    <div key={ev.id} className="rv-seal">
                      <SealCard ev={ev} inline announce />
                    </div>
                  ))}
                  <LevelFacts outcome={advanced} covered={seals.map((s) => s.dedupeKey ?? "")} />
                </>
              )}
            </>
          ) : (
            <>
              <div className="rv-head">
                <span className="rv-badge miss" aria-hidden="true">
                  <Icon name="undo" />
                </span>
                <div className="t">
                  <h3>{result.trueFact.headline}</h3>
                  <p>{result.trueFact.detail}</p>
                </div>
              </div>
              <div className="rv-why">
                <div className="row2">
                  <span>{card.questionType === "MULTI" ? "You chose" : "You answered"}</span>
                  <b>{answer || "—"}</b>
                </div>
                <div className="row2">
                  <span>The answer</span>
                  <b>{result.expected}</b>
                </div>
                {result.judged?.reason && (
                  <p className="t-meta ink-1 rv-judged" style={{ marginTop: 6 }}>
                    Checked on meaning: {result.judged.reason}
                  </p>
                )}
                {result.explanation && result.explanation !== result.expected && (
                  <p className="t-meta ink-1" style={{ marginTop: 6 }}>
                    {result.explanation}
                  </p>
                )}
              </div>
              <p className="t-meta" style={{ marginTop: 10 }}>
                {result.combo.next === 0
                  ? "The combo resets to 0. Points already paid stay paid."
                  : `The combo drops to ${result.combo.next}. Points already paid stay paid.`}
              </p>
            </>
          )}
          <div className="rv-acts">
            <div className="rv-hair" hidden={!runAuto || motion !== "full"} aria-hidden="true">
              <i ref={hairRef} />
            </div>
            {runAuto && motion !== "full" && (
              // Calm strips the hairline's motion, so the countdown is said in words instead.
              <p className="t-meta" style={{ marginBottom: 8 }}>
                Moving on in {AUTO_ADVANCE_MS / 1000} seconds. Tap or point here to stay.
              </p>
            )}
            <Button ref={nextRef} variant="primary" size="lg" block kbd="Enter" onClick={onNext}>
              {nextLabel}
            </Button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

type Advanced = Extract<SubmitReviewResult["outcome"], { outcome: "advanced" }>;

/** The domain meter: ink base at the old value, the pts gain growing old → new over 700 ms. */
function DomainMeter({ outcome }: { outcome: Advanced }) {
  const { before, after } = outcome.domain.progress;
  const crossed = after.level > before.level;
  const from = crossed ? 0 : before.progress;
  const intoBefore = crossed ? 0 : before.pointsIntoLevel;
  const capped = after.level > outcome.domain.level.after;
  return (
    <div className="rv-meter">
      <div className="ml">
        <span>
          {outcome.domain.name} · level {outcome.domain.level.after}
        </span>
        <span className="num">
          {formatNumber(intoBefore)} → {formatNumber(after.pointsIntoLevel)} / {formatNumber(after.pointsForNextLevel, 0)}
        </span>
      </div>
      <Meter
        value={from}
        gain={{ value: after.progress, from, kind: "pts" }}
        label={`${outcome.domain.name}: points toward points level ${after.level + 1}`}
        valueText={`${Math.round(after.progress * 100)}% toward points level ${after.level + 1}`}
      />
      {capped && (
        <p className="t-meta" style={{ marginTop: 6 }}>
          Points reach level {after.level}; depth holds it at {outcome.domain.level.after} until more of its ideas mature.
        </p>
      )}
    </div>
  );
}

/** Level-ups the server reported that no Seal covers (L3's detectors own the Seal; this is the plain fact). */
function LevelFacts({ outcome, covered }: { outcome: Advanced; covered: string[] }) {
  const rows: { key: string; title: string; sub: string; level: number }[] = [];
  const d = outcome.domain;
  if (d.level.after > d.level.before && !covered.some((k) => k.startsWith(`domain:${d.id}:`))) {
    rows.push({ key: "d", title: `${d.name} reached level ${d.level.after}`, sub: `Domain · was level ${d.level.before}`, level: d.level.after });
  }
  const f = outcome.field;
  if (f.level.after > f.level.before && !covered.some((k) => k.startsWith(`field:${f.id}:`))) {
    rows.push({ key: "f", title: `${f.name} field reached level ${f.level.after}`, sub: `Field · was level ${f.level.before}`, level: f.level.after });
  }
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className="rv-levelup">
          <Medallion material={medallionMaterial(r.level)} numeral={r.level} size={40} />
          <div style={{ minWidth: 0 }}>
            <b style={{ display: "block", fontWeight: 600 }}>{r.title}</b>
            <span className="t-meta">{r.sub}</span>
          </div>
        </div>
      ))}
    </>
  );
}
