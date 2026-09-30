"use client";

import type { Horizon } from "@/lib/life-types";
import type { GoalCard } from "@/lib/today-board";
import { ChipButton } from "@/components/ui/Chip";
import { CurrencyGlyph } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { SectionHeader } from "@/components/ui/Tabs";
import { formatNumber, formatPercent } from "@/components/ui/format";

/** A goal's frozen MP payout (M5): "pays ⬡ 6 × progress from 70%". Absent until goals pay. */
export interface GoalPayout {
  mp: number;
  /** Progress from which it pays (0.7). */
  from: number;
}

interface Props {
  goals: Record<Horizon, GoalCard[]>;
  busy: boolean;
  onProgress: (goalId: string) => void;
  /** The frozen payout per goal, once goals pay (M5). Without it the line says goals pay through their steps. */
  payoutOf?: (goalId: string) => GoalPayout | null;
}

const HORIZON_ORDER: Horizon[] = ["SHORT", "MID", "LONG"];
const HORIZON_LABEL: Record<Horizon, string> = { SHORT: "Short", MID: "Mid", LONG: "Long" };

/**
 * Goals, nearest horizon first, each with an honest rollup: a goal measured
 * by its steps shows the share of one-off steps done, one measured by hand
 * shows its count against the target (with its +1), and a goal with
 * neither says so rather than drawing a meter it cannot justify. Support
 * habits read "82% kept (28 d)": context, not progress. Goals pay nothing
 * of their own yet; their steps do, and the line says which.
 */
export function GoalsStrip({ goals, busy, onProgress, payoutOf }: Props) {
  const list = HORIZON_ORDER.flatMap((h) => goals[h]);

  return (
    <section className="today-goals" aria-labelledby="goals-h">
      <SectionHeader id="goals-h" title="Goals" aside={list.length === 0 ? "none yet" : `${list.length} open`} />
      <div className="card">
        {list.length === 0 ? (
          <p className="goal goal-empty t-meta">
            Capture one with <span className="t-mono">goal: read 12 books by dec</span>, then link steps to it with{" "}
            <span className="t-mono">^read</span>.
          </p>
        ) : (
          list.map((g) => {
            const pay = payoutOf?.(g.template.id) ?? null;
            return (
              <div key={g.template.id} className="goal">
                <div className="gh">
                  <b>{g.template.title}</b>
                  <span>
                    {HORIZON_LABEL[g.horizon]}
                    {g.dueLabel ? ` · ${g.dueLabel}` : ""}
                  </span>
                </div>
                {g.progress != null && <Meter value={g.progress} label={`${g.template.title}: ${g.label}`} valueText={g.label} />}
                <div className="gf">
                  <span className="num">{g.progress != null && g.metric !== "MANUAL" ? formatPercent(g.progress) : g.label}</span>
                  {g.progress != null && g.metric !== "MANUAL" && <span>· {g.label}</span>}
                  {pay ? (
                    <span>
                      · pays{" "}
                      <span className="cur">
                        <CurrencyGlyph kind="mp" />
                        <span className="num">{formatNumber(pay.mp, pay.mp % 1 === 0 ? 0 : 1)} × progress</span>
                      </span>{" "}
                      from {formatPercent(pay.from)}
                    </span>
                  ) : (
                    <span>· pays through its steps</span>
                  )}
                  {g.metric === "MANUAL" && (
                    <ChipButton className="goal-plus" disabled={busy} onClick={() => onProgress(g.template.id)} aria-label={`Add one to ${g.template.title}`}>
                      +1
                    </ChipButton>
                  )}
                </div>
                {g.support && <p className="t-meta">{g.support}</p>}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
