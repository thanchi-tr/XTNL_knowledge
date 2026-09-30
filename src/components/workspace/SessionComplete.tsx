"use client";

/**
 * The recap: the session receipt (redesign › Study › Review › Recap).
 *
 * Headline, review points, recalled, best combo; the quest ring closing to
 * CLEARED (the T1 "quest cleared" fires here, not on the next Today visit);
 * What moved (the run's merged Seals, levels, MP minted, the day kept);
 * True facts from this session's results; Back tomorrow (each miss, linking
 * to its idea); the per-card receipt; the next batch; Back to Today.
 *
 * Its sections reveal with a 70 ms stagger — the only stagger in the app,
 * and it is a result, not an arrival. Everything rests on its final state,
 * so Calm and Still show the same words at once. No framer-motion.
 */
import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import type { CelebrationEvent } from "@/lib/celebration-types";
import { chime } from "@/lib/celebrate";
import { LIFE_TZ, type DayKey } from "@/lib/life-day";
import { medallionMaterial } from "@/lib/materials";
import { play } from "@/lib/motion";
import { minutesFor, sessionFactsOf } from "@/lib/review-facts";
import { FocusMode } from "@/components/shell/FocusMode";
import { Amount } from "@/components/ui/Amount";
import { Button, IconButton } from "@/components/ui/Button";
import { Medallion } from "@/components/ui/Crest";
import { CurrencyGlyph, Icon } from "@/components/ui/Icon";
import { PromiseRing } from "@/components/ui/PromiseRing";
import { SectionHeader } from "@/components/ui/Tabs";
import { cx } from "@/components/ui/cx";
import { formatAmount, formatMultiplier, formatNumber } from "@/components/ui/format";
import {
  backTomorrowOf,
  levelRowsOf,
  receiptOf,
  sessionCardFacts,
  tallyOf,
  type CardResult,
  type QuestView,
} from "./review-model";

interface Props {
  results: readonly CardResult[];
  /** T2s merged into the run (celebrate.ts closeRun). */
  merged: readonly CelebrationEvent[];
  questBefore: QuestView;
  questAfter: QuestView;
  startedAt: number;
  endedAt: number;
  /** The day was kept by this session (its first deed), with the streak it reached when known. */
  dayKept: { streak: number | null } | null;
  /** Still due today after this session, in every field. */
  remainingDue: number;
  upcoming: { label: string; count: number } | null;
  /** Fields this session left with nothing due today. */
  fieldsCleared: string[];
  today: DayKey;
  /** The boss's verdict, when this was an encounter. */
  boss?: ReactNode;
  onBackToReview: () => void;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: LIFE_TZ });
}

export function SessionComplete({
  results,
  merged,
  questBefore,
  questAfter,
  startedAt,
  endedAt,
  dayKept,
  remainingDue,
  upcoming,
  fieldsCleared,
  today,
  boss,
  onBackToReview,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const questRef = useRef<HTMLElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const tally = tallyOf(results);
  const receipt = receiptOf(results);
  const facts = sessionFactsOf(sessionCardFacts(results));
  const back = backTomorrowOf(results);
  const levels = levelRowsOf(results, merged);
  const clearedNow = questAfter.cleared && !questBefore.cleared;
  const minutes = Math.max(1, Math.round((endedAt - startedAt) / 60_000));

  // The reveal (Full: 70 ms stagger; Calm: opacity only; Still: nothing) and the one T1.
  useEffect(() => {
    const root = rootRef.current;
    root?.querySelectorAll(":scope > [data-reveal]").forEach((el, i) => {
      void play(el, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 360, delay: i * 70 });
    });
    if (clearedNow) {
      chime({
        kind: "quest-cleared",
        id: `quest:${today}`,
        text: "Quest cleared",
        say: `Quest cleared: ${questAfter.done} of ${questAfter.target} today.`,
        sweepEl: questRef.current,
        burstEl: ringRef.current,
        ringEl: ringRef.current,
      });
    } else if (fieldsCleared.length > 0) {
      chime({
        kind: "field-cleared",
        id: `field-cleared:${today}:${fieldsCleared.join(",")}`,
        text: `${fieldsCleared[0]} cleared for today`,
      });
    }
    // Once, when the recap first shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const headline = clearedNow ? "Quest cleared" : `${tally.correct} of ${tally.answered} recalled`;
  const questLine =
    questAfter.target > 0 ? `${Math.min(questAfter.done, questAfter.target)} of ${questAfter.target} today.` : "";
  const dueLine =
    remainingDue > 0
      ? ` ${remainingDue} more ${remainingDue === 1 ? "is" : "are"} due${clearedNow ? " and can wait until tomorrow" : " today"}.`
      : " Nothing else is due today.";
  const yieldColumn = receipt.yieldAll == null && receipt.rows.some((r) => r.yield != null);
  const bonuses = receipt.rows.filter((r) => r.masteryBonus > 0);

  return (
    <div className="rv-recap" ref={rootRef} data-review-session="">
      <FocusMode />
      <div className="rv-recap-top">
        <IconButton icon="back" label="Back to Review" onClick={onBackToReview} />
        <span className="t-eyebrow" style={{ flex: 1 }}>
          Review · recap
        </span>
      </div>

      {boss && <div data-reveal="">{boss}</div>}

      <section className="card rv-rc-hero" data-reveal="" aria-labelledby="rv-rc-h">
        <div className="t-eyebrow">
          Session · {minutes} min · {clock(endedAt)}
        </div>
        <h1 id="rv-rc-h" className="t-display-l">
          {headline}
        </h1>
        <p className="t-meta" style={{ marginTop: 4 }}>
          {questLine}
          {dueLine}
        </p>
        <div className="rv-stats3">
          <div>
            <div className="v">
              <CurrencyGlyph kind="pts" />
              <span>{formatNumber(tally.pts)}</span>
            </div>
            <div className="k">review pts this session</div>
          </div>
          <div>
            <div className="v">
              {tally.correct}
              <small className="t-meta"> / {tally.answered}</small>
            </div>
            <div className="k">recalled</div>
          </div>
          <div>
            <div className="v">{tally.bestCombo}</div>
            <div className="k">best combo</div>
          </div>
        </div>
      </section>

      {questAfter.target > 0 && (
        <section ref={questRef} className={cx("card rv-quest", questAfter.cleared && "cleared")} data-reveal="">
          <div ref={ringRef}>
            <PromiseRing
              value={Math.min(questAfter.done, questAfter.target)}
              target={questAfter.target}
              size={56}
              label="Today's quest"
              from={questBefore.done}
              glint={clearedNow}
              showCount
            />
          </div>
          <div className="t">
            <b className="t-display-s" style={{ display: "block" }}>
              Quest · {questAfter.target} cards
            </b>
            <div className="t-meta">
              {questAfter.cleared
                ? "Paid in review points, as promised. It pays 0 life XP because the reviews already paid."
                : `${questAfter.target - questAfter.done} to go today. Reviews pay review points, 0 life XP.`}
            </div>
          </div>
          {questAfter.cleared && <span className={cx("stamp", clearedNow && "landing")}>Cleared</span>}
        </section>
      )}

      {(merged.length > 0 || levels.length > 0 || tally.mp > 0 || dayKept || fieldsCleared.length > 0) && (
        <>
          <SectionHeader title="What moved" />
          <section className="card rv-moved" data-reveal="">
            {merged.map((ev) => (
              <div key={ev.id} className="rv-mv">
                <span className="ic">
                  <Medallion material={ev.facts.material ?? "bronze"} numeral={ev.facts.numeral?.to ?? null} size={40} />
                </span>
                <div className="tx">
                  <b>{ev.facts.title}</b>
                  <span className="sub">{["Seal", ev.facts.lines?.[0] ?? ev.what[0]?.label].filter(Boolean).join(" · ")}</span>
                </div>
                {ev.facts.amounts?.[0] && (
                  <span className="amt">
                    <Amount kind={ev.facts.amounts[0].kind} value={ev.facts.amounts[0].value} />
                  </span>
                )}
              </div>
            ))}
            {levels.map((l) => (
              <div key={l.key} className="rv-mv">
                <span className="ic">
                  <Medallion material={medallionMaterial(l.level)} numeral={l.level} size={40} />
                </span>
                <div className="tx">
                  <b>{l.label}</b>
                  <span className="sub">{l.detail}</span>
                </div>
              </div>
            ))}
            {tally.mp > 0 && (
              <div className="rv-mv">
                <span className="ic">
                  <CurrencyGlyph kind="mp" />
                </span>
                <div className="tx">
                  <b>Mastery points minted</b>
                  <span className="sub">
                    From {tally.correct} correct answer{tally.correct === 1 ? "" : "s"}: a tenth of a point per idea level, more with the combo
                  </span>
                </div>
                <span className="amt">
                  <Amount kind="mp" value={tally.mp} />
                </span>
              </div>
            )}
            {dayKept && (
              <div className="rv-mv">
                <span className="ic" style={{ color: "var(--light)" }}>
                  <Icon name="flame" size={24} />
                </span>
                <div className="tx">
                  <b>{dayKept.streak ? `Day ${dayKept.streak} kept` : "Today kept"}</b>
                  <span className="sub">Your first deed today was this session&apos;s first answer.</span>
                </div>
              </div>
            )}
            {fieldsCleared.map((f) => (
              <div key={f} className="rv-mv">
                <span className="ic">
                  <Icon name="check" size={22} />
                </span>
                <div className="tx">
                  <b>{f} cleared</b>
                  <span className="sub">Nothing left due in this field today.</span>
                </div>
              </div>
            ))}
          </section>
        </>
      )}

      {facts.length > 0 && (
        <>
          <SectionHeader title="True facts" />
          <section className="card pad-l" data-reveal="">
            <ul className="rv-facts">
              {facts.map((f, i) => (
                <li key={i}>
                  <span>
                    {f.before}
                    <b className="ink-0">{f.strong}</b>
                    {f.after}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {back.length > 0 && (
        <>
          <SectionHeader title="Back tomorrow" />
          <section className="card" data-reveal="">
            {back.map((b) => (
              <Link key={b.id} className="rv-idea" href={`/library/${b.id}`}>
                <div style={{ minWidth: 0 }}>
                  <b>{b.title}</b>
                  <span className="t-meta">{b.line}</span>
                </div>
                <Icon name="chev" className="ink-2" size={16} />
              </Link>
            ))}
          </section>
        </>
      )}

      <section className="card pad-l" data-reveal="" aria-labelledby="rv-rc-receipt">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <b id="rv-rc-receipt">Session receipt</b>
          <span className="t-meta">every number, per card</span>
        </div>
        <table className="rv-rtab" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th scope="col">Idea</th>
              <th scope="col">Base</th>
              <th scope="col">Combo</th>
              {yieldColumn && <th scope="col">Yield</th>}
              <th scope="col">Paid</th>
            </tr>
          </thead>
          <tbody>
            {receipt.rows.map((r) => (
              <tr key={r.id} className={r.correct ? undefined : "miss"}>
                <td title={r.title}>{r.title}</td>
                <td>{r.base != null ? r.base.toFixed(2) : "—"}</td>
                <td>{r.combo != null ? formatMultiplier(r.combo) : "miss"}</td>
                {yieldColumn && <td>{r.yield != null ? formatMultiplier(r.yield) : "—"}</td>}
                <td>{formatNumber(r.paid)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={yieldColumn ? 4 : 3}>
                Total
                {receipt.yieldAll != null && Math.abs(receipt.yieldAll - 1) > 1e-9 ? ` · yield ${formatMultiplier(receipt.yieldAll)} on all` : ""}
              </td>
              <td>{formatNumber(receipt.total)}</td>
            </tr>
          </tfoot>
        </table>
        {bonuses.map((r) => (
          <p key={r.id} className="rc-note">
            {r.title}: paid includes the {formatAmount(r.masteryBonus)} mastery bonus.
          </p>
        ))}
        <p className="rc-note">
          Nothing here is random: the same answers always pay the same. Life XP: 0, because reviews pay review points.
          {receipt.rounding ? " Rows are rounded to 0.1; the total is their exact sum." : ""}
        </p>
      </section>

      <p className="t-meta" style={{ textAlign: "center" }}>
        {remainingDue > 0
          ? `${remainingDue} more due today, about ${minutesFor(remainingDue)} minute${minutesFor(remainingDue) === 1 ? "" : "s"}.`
          : upcoming
            ? `Next batch: ${upcoming.count} card${upcoming.count === 1 ? "" : "s"} ${upcoming.label.toLowerCase()}, about ${minutesFor(upcoming.count)} minute${minutesFor(upcoming.count) === 1 ? "" : "s"}.`
            : "Nothing else is scheduled yet."}
      </p>
      <div className="rv-col" style={{ gap: 8 }}>
        <Button href="/today" variant="primary" size="lg" block>
          Back to Today
        </Button>
        {remainingDue > 0 && (
          <Button variant="secondary" size="lg" block onClick={onBackToReview}>
            Review more
          </Button>
        )}
      </div>
    </div>
  );
}
