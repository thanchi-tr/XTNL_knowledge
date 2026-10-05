/**
 * "Past week quests" (F14, F18 §3): one collapsed line per frozen week,
 * "Week of 28 Sep · 4 of 5 done", with "· capped" and "· 2 days held" in ink,
 * or "still settling" before its Wednesday 04:00. Never red, never 'miss'.
 *
 * UI motion (ui-motion.md §3.3 screen 5, D1, D13, D29): the weeks fold into a
 * ▸ whose summary is "Past week quests" over a static five-week strip, one
 * cell per week filled to its share done (in ink), a held week ringed (held =
 * the kit's held mark, never a dash), a week still settling outlined only.
 * The strip is aria-hidden; the list in the ▸ holds every week's full line,
 * and "final from the Wednesday after". Nothing here moves.
 */
import type { CSSProperties } from "react";
import { Mark } from "@/components/glyph/Glyph";
import type { PastWeekView } from "@/lib/roadmap-types";
import { pastWeekLine } from "./roadmap-copy";

/** The strip's weeks: the last five, oldest first (the list keeps the view's order). */
export const PAST_WEEK_CELLS = 5;

export function pastWeekCellsOf(weeks: readonly PastWeekView[]): { key: string; share: number; settled: boolean; held: boolean }[] {
  return [...weeks]
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0))
    .slice(-PAST_WEEK_CELLS)
    .map((w) => ({ key: w.weekStart, share: w.total > 0 ? Math.max(0, Math.min(1, w.done / w.total)) : 0, settled: w.settled, held: w.heldDays > 0 }));
}

export function PastWeekQuests({ weeks, today }: { weeks: readonly PastWeekView[]; today: string }) {
  if (weeks.length === 0) return null;
  const cells = pastWeekCellsOf(weeks);
  return (
    <details className="rm-past-d">
      <summary className="rm-past-s">
        <span className="t-eyebrow">Past week quests</span>
        <span className="rm-pw" aria-hidden="true">
          {cells.map((c) => (
            <i key={c.key} className="rm-pw-c" data-settled={c.settled ? "" : undefined} data-held={c.held ? "" : undefined} style={{ "--rm-pw": c.share.toFixed(3) } as CSSProperties} />
          ))}
        </span>
        <Mark glyph="i-chev" size={16} className="rm-chev" />
      </summary>
      <div className="rm-past-more">
        <span className="rm-cap">final from the Wednesday after</span>
        <ul className="rm-past">
          {weeks.map((w) => {
            const [head, tail] = pastWeekLine(w, today);
            return (
              <li key={w.weekStart}>
                <span>{head}</span>
                <span>{tail}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </details>
  );
}
