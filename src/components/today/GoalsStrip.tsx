"use client";

import type { Horizon } from "@/lib/life-types";
import type { GoalCard } from "@/lib/today-board";
import { ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph, Sigil } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { SectionHeader } from "@/components/ui/Tabs";
import { goalCardCopy } from "./board-ui";
import { TRACK_SIGIL } from "./format";

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
 */
export function GoalsStrip({ goals, busy, onProgress, launched = false, onClose, onReschedule, justAdded = null }: Props) {
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
            return (
              <div key={g.template.id} className="goal" data-template-id={g.template.id} data-just-added={fresh ? "1" : undefined}>
                <div className="gh">
                  <b>
                    {title}
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
                  {copy.percent != null && <span>· {g.label}</span>}
                  {copy.pays ? (
                    <span>
                      · <PaysText text={copy.pays} />
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
