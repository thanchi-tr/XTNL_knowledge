"use client";

import type { Horizon } from "@/lib/life-types";
import type { GoalCard } from "@/lib/today-board";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph, Sigil } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { SectionHeader } from "@/components/ui/Tabs";
import { goalCardCopy } from "./board-ui";
import { TRACK_SIGIL } from "./format";
import { NamedTitle, namedOfTitle, type TodayNamedTitles } from "./NamedTitle";

interface Props {
  goals: Record<Horizon, GoalCard[]>;
  busy: boolean;
  onProgress: (goalId: string) => void;
  /**
   * Whether life counts yet (isLaunched(today), from the page). Before, a
   * goal shows its progress only: no stated MP and no Close (a close before
   * launch would write a permanent paid-nothing row).
   */
  launched?: boolean;
  /** Opens the Close sheet for a goal (launched only). */
  onClose?: (goalId: string) => void;
  /** Opens the Reschedule sheet for a goal carried past its due day. */
  onReschedule?: (goalId: string) => void;
  /** A goal just captured: outlined for a moment, and said (TodayBoard finds it by data-template-id). */
  justAdded?: string | null;
  /** The live fix (contracts §22.11): a milestone goal's Gemini-named Domain names, by template id, and the page's mark (pv.named). */
  namedTitles?: TodayNamedTitles | null;
}

const HORIZON_ORDER: Horizon[] = ["SHORT", "MID", "LONG"];

/**
 * The Goals heading's id. It takes focus (tabIndex -1) when a close removes
 * the card whose Close chip opened the sheet and no other goal is left.
 */
export const GOALS_HEADING_ID = "goals-h";

/** A card's Close chip (data-goal-close), so focus can move to the next goal's after a close. */
export const GOAL_CLOSE_CHIP = "[data-goal-close]";

/** 'pays ⬡ 6 × progress from 70%': the ⬡ becomes the MP glyph, kept with its figure. */
function PaysText({ text }: { text: string }) {
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

/**
 * Goals, nearest horizon first, each with an honest rollup: a goal measured
 * by its steps shows the share of one-off steps done, one measured by hand
 * shows its count against the target (with its +1), and a goal with
 * neither says so rather than drawing a meter it cannot justify. Progress
 * is goals.ts goalProgress as of min(today, due day), and the percentage is
 * goalPercent (floored), so Today and the You sheet read the same number.
 * Support habits read "82% kept (28 d)": context, not progress.
 *
 * Before life counts a goal pays nothing of its own (its steps do, and the
 * line says so). From launch it states what it pays, fixed when it was set
 * ('pays ⬡ 6 × progress from 70%'), and offers Close. Past its due day and
 * short of 100% it is carried, never owed: 'Carried 0.55 · Reschedule?'.
 *
 * A roadmap milestone's goal (krMetric ROADMAP, roadmap.md F16 seam 4) is
 * measured from stored readings only: its line names the evidence of the
 * part that set g ('23% · tested by your reviews · slowest: cards at level
 * 6+ · measured 09:12', or '· from your ticks · …'), a 0-stated one says why
 * after 'pays nothing', and a quiet chip names its place ('Roadmap ·
 * milestone 2 of 3'). One that will never be measured again (its roadmap
 * archived by a reset or by hand, or its row replaced by Start again) reads
 * 'not measured · pays nothing' with its note on a line of its own: its
 * close pays 0 whatever it stated, so the card never shows '× progress'.
 * No +1 (it is measured from your records), and never an owed tone.
 */
export function GoalsStrip({ goals, busy, onProgress, launched = false, onClose, onReschedule, justAdded = null, namedTitles }: Props) {
  const list = HORIZON_ORDER.flatMap((h) => goals[h]);

  return (
    <section className="today-goals" aria-labelledby={GOALS_HEADING_ID}>
      <SectionHeader id={GOALS_HEADING_ID} tabIndex={-1} title="Goals" aside={list.length === 0 ? "none yet" : `${list.length} open`} />
      <div className="card">
        {list.length === 0 ? (
          <p className="goal goal-empty t-meta">
            Capture one with <span className="t-mono">goal: read 12 books by dec</span>, then link steps to it with{" "}
            <span className="t-mono">^read</span>.
          </p>
        ) : (
          list.map((g) => {
            const copy = goalCardCopy(g, launched);
            const fresh = justAdded === g.template.id;
            const title = g.template.title;
            const rm = g.roadmap ?? null;
            // 'measured 09:12' follows the evidence words, only beside a figure (never on 'not measured').
            const measured = rm?.measured && copy.percent != null ? ` · ${rm.measured}` : "";
            // Never measured again: its close pays 0, so the stated rule is not offered.
            const pays = copy.pays && rm?.unmeasured ? "pays nothing" : copy.pays;
            return (
              <div key={g.template.id} className="goal" data-template-id={g.template.id} data-just-added={fresh ? "1" : undefined}>
                <div className="gh">
                  <b>
                    <NamedTitle title={title} named={namedOfTitle(namedTitles, g.template.id)} mark={namedTitles?.mark} />
                    {fresh && <span className="sr-only">, just added</span>}
                  </b>
                  <span className="goal-meta">
                    <Sigil track={TRACK_SIGIL[g.template.track]} size={14} className="ink-2" />
                    <span className="sr-only">{copy.track}, </span>
                    {copy.horizon}
                    {g.dueLabel ? ` · ${g.dueLabel}` : ""}
                  </span>
                </div>
                {g.progress != null && <Meter value={g.progress} label={`${title}: ${g.label}`} valueText={copy.percent ?? g.label} />}
                <div className="gf">
                  <span className="num">{copy.percent ?? g.label}</span>
                  {copy.percent != null && (
                    <span>
                      · {g.label}
                      {measured}
                    </span>
                  )}
                  {pays ? (
                    <span>
                      · <PaysText text={pays} />
                      {rm?.zeroReason ? ` · ${rm.zeroReason}` : ""}
                    </span>
                  ) : (
                    <span>· pays through its steps</span>
                  )}
                  {g.metric === "MANUAL" && (
                    <ChipButton className="goal-plus" disabled={busy} onClick={() => onProgress(g.template.id)} aria-label={`Add one to ${title}`}>
                      +1
                    </ChipButton>
                  )}
                </div>
                {g.support && <p className="t-meta">{g.support}</p>}
                {rm?.note && <p className="t-meta goal-note">{rm.note}</p>}
                {rm?.chip && (
                  <div className="goal-acts goal-chips">
                    <Chip>{rm.chip}</Chip>
                  </div>
                )}
                {(copy.carried || (copy.canClose && onClose)) && (
                  <div className="goal-acts">
                    {copy.carried && <span className="goal-carried">{copy.carried}</span>}
                    {copy.carried && onReschedule && (
                      <ChipButton disabled={busy} onClick={() => onReschedule(g.template.id)} aria-haspopup="dialog" aria-label={`Reschedule ${title}`}>
                        Reschedule
                      </ChipButton>
                    )}
                    {copy.canClose && onClose && (
                      <ChipButton
                        disabled={busy}
                        onClick={() => onClose(g.template.id)}
                        aria-haspopup="dialog"
                        aria-label={`Close ${title}`}
                        data-goal-close=""
                      >
                        Close
                      </ChipButton>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
