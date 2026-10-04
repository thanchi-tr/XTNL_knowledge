/**
 * "Past week quests" (F14, F18 §3): one collapsed line per frozen week,
 * "Week of 28 Sep · 4 of 5 done", with "· capped" and "· 2 days held" in ink,
 * or "still settling" before its Wednesday 04:00. Never red, never 'miss'.
 */
import type { PastWeekView } from "@/lib/roadmap-types";
import { pastWeekLine } from "./roadmap-copy";

export function PastWeekQuests({ weeks, today }: { weeks: readonly PastWeekView[]; today: string }) {
  if (weeks.length === 0) return null;
  return (
    <>
      <div className="rm-qsub">
        <span className="t-eyebrow">Past week quests</span>
        <span className="rm-cap">final from the Wednesday after</span>
      </div>
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
    </>
  );
}
