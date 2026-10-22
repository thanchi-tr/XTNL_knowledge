import { dayLongLabel, dayShortLabel } from "@/lib/habit-history";
import { DAILY_QUESTS_TITLE, questWeekLine, type QuestCell, type QuestWeek as QuestWeekView } from "@/lib/daily-quests";

/** A cell in words, for its screen-reader name and its tooltip. */
const CELL_WORDS: Record<QuestCell, string> = {
  "1": "kept",
  m: "kept at the minimum",
  s: "skipped, left out",
  h: "held, left out",
  "0": "not kept",
  o: "still open",
  "-": "not a must that day",
  f: "still to come",
};

const WEEKDAY_LETTER = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Tasks › Habits: this week of every daily quest (the user's musts; decisions D14 and D15), one 1/0 strip per must,
 * Monday first. A kept day fills in --kept (as Today's strip), the minimum version lighter (it counts 1, and the line
 * above says "n at minimum"), a skipped or held day an outline (left out of the count, as the weekly audit leaves it
 * out: "n skipped", D16), a day not kept is a muted square, an open one a faint fill with no outline (the year grid's
 * open day; an outline is the page legend's held), a day it is not a must a dash. The line above names the open days
 * too (questWeekLine: "Nothing judged yet · 4 still open" on a Monday). Read-only, like the page; nothing when no must
 * falls due this week. Colour is never alone: every cell is named for its quest, day and state.
 */
export function QuestWeek({ week, today }: { week: QuestWeekView; today: string }) {
  if (week.rows.length === 0) return null;
  return (
    <section className="card hh-quests" aria-labelledby="hh-quests-h">
      <div className="hh-q-head">
        <h2 id="hh-quests-h" className="hh-title">
          {DAILY_QUESTS_TITLE} · this week
        </h2>
        <p className="hh-rule">{questWeekLine(week)}</p>
      </div>
      <table className="hh-q-table">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Quest</span>
            </th>
            {week.days.map((d, i) => (
              <th key={d} scope="col" className="hh-q-day" data-today={d === today ? "" : undefined}>
                <span aria-hidden="true">{WEEKDAY_LETTER[i]}</span>
                <span className="sr-only">{dayShortLabel(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.rows.map((r) => (
            <tr key={r.templateId}>
              <th scope="row" className="hh-q-name">
                {r.title}
              </th>
              {r.cells.map((c, i) => (
                <td key={week.days[i]} title={`${r.title}, ${dayLongLabel(week.days[i])}: ${CELL_WORDS[c]}`}>
                  <span className="hh-q" data-q={c} aria-hidden="true" />
                  <span className="sr-only">{CELL_WORDS[c]}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
