import { dailyQuestsLabel, type DailyQuests } from "@/lib/daily-quests";

/**
 * The Must lane's daily quest strip (blueprint 2.4; decisions D14 and D15): one cell per daily quest asking today, in
 * the lane's order, filled once it is kept (1) and empty while it is not (0). A quest kept at the minimum version
 * fills too (it counts 1) in a lighter fill, and the lane's chips say "n at minimum". Binary is a status only: the
 * strip shows no XP (each row's price stays graded). Colour is never alone: the strip is named in words
 * (dailyQuestsLabel) and each cell says its quest and state. Nothing when no quest asks today.
 */
export function DailyStrip({ daily }: { daily: DailyQuests }) {
  if (daily.total === 0) return null;
  return (
    <ol className="dq-strip" aria-label={dailyQuestsLabel(daily)}>
      {daily.quests.map((q, i) => {
        const state = q.minimum ? "kept at the minimum" : q.kept ? "kept" : "not kept yet";
        return (
          <li key={`${q.templateId}:${i}`} className="dq-cell" data-bit={q.kept ? "1" : "0"} data-min={q.minimum ? "" : undefined} title={`${q.title}: ${state}`}>
            <span className="sr-only">{`${q.title}: ${state}`}</span>
          </li>
        );
      })}
    </ol>
  );
}
