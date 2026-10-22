import type { Metadata } from "next";
import Link from "next/link";
import "@/components/habits/habits.css";
import { getCurrentUserId } from "@/lib/user";
import { todayKey } from "@/lib/life-day";
import { yearOfParam, type HabitYearCard, type HabitYearView } from "@/lib/habit-history";
import { loadHabitYear } from "@/lib/habit-history-server";
import { loadQuestWeek } from "@/lib/daily-quests-server";
import type { QuestWeek as QuestWeekView } from "@/lib/daily-quests";
import { HabitCard } from "@/components/habits/HabitCard";
import { QuestWeek } from "@/components/habits/QuestWeek";
import { HabitHash } from "@/components/habits/HabitHash";
import { Button } from "@/components/ui/Button";

export const metadata: Metadata = { title: "Habits" };

// Every square turns on the life day (and on every tick): never baked at build time.
export const dynamic = "force-dynamic";

/** The legend: what each square means (in a neutral ink; each card wears its own hue). */
const LEGEND: readonly { code: string; label: string }[] = [
  { code: "d", label: "Kept" },
  { code: "m", label: "Minimum" },
  { code: "h", label: "Held · rest or skip" },
  { code: "x", label: "Missed" },
  { code: "n", label: "Not due" },
];

/**
 * Tasks › Habits (/today/habits): each personal habit's year as a grid of days in its own hue, its % kept, its
 * streaks and this week (habit-history.ts), with a year switcher (?year=, this year by default) and the ended habits
 * in a fold; above them, this year only, this week of every daily quest as a 1/0 strip per must (QuestWeek; decisions
 * D14 and D15). Read-only: two cached reads (habit-history-server.ts, daily-quests-server.ts), nothing settled,
 * judged or written. The top bar's title is nav.ts's (Tasks · Habits); the shell owns <main>.
 */
export default async function HabitsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const now = new Date();
  const today = todayKey(now);
  const year = yearOfParam(query.year, today);
  const thisYear = year === Number(today.slice(0, 4));
  // This week's daily quests (D14, D15) show with this year only; a failed read leaves them out, never the page.
  const [view, quests] = await Promise.all([
    loadHabitYear(getCurrentUserId(), year, now).catch((err: unknown): HabitYearView | null => {
      console.error("Habits: the year failed to load.", err);
      return null;
    }),
    thisYear
      ? loadQuestWeek(getCurrentUserId(), now).catch((err: unknown): QuestWeekView | null => {
          console.error("Habits: this week's daily quests failed to load.", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="page hh-page cq-main">
      <div className="hh-top">
        <nav className="hh-years" aria-label="Year">
          {view?.prev != null ? (
            <Link className="hh-year-link" href={`/today/habits?year=${view.prev}`} aria-label={`Previous year, ${view.prev}`}>
              ‹ {view.prev}
            </Link>
          ) : (
            <span className="hh-year-off" aria-hidden="true">
              ‹
            </span>
          )}
          <span className="hh-year-now" aria-current="page">
            {year}
          </span>
          {view?.next != null ? (
            <Link className="hh-year-link" href={view.next === Number(today.slice(0, 4)) ? "/today/habits" : `/today/habits?year=${view.next}`} aria-label={`Next year, ${view.next}`}>
              {view.next} ›
            </Link>
          ) : (
            <span className="hh-year-off" aria-hidden="true">
              ›
            </span>
          )}
        </nav>
        {view && <p className="t-meta hh-sum">{view.summary}</p>}
      </div>

      {quests && <QuestWeek week={quests} today={today} />}

      {!view ? (
        <div className="card pad-l hh-empty" role="alert">
          <p className="t-body">Couldn&apos;t load your habits. Try again in a moment.</p>
          <Button variant="secondary" href="/today/habits">
            Try again
          </Button>
        </div>
      ) : view.habits.length === 0 && view.ended.length === 0 ? (
        <div className="card pad-l hh-empty">
          <p className="t-body">{year === Number(today.slice(0, 4)) ? "No habits yet." : `No habits in ${year}.`}</p>
          <p className="t-meta">A task with a rule (every day, Mon · Wed · Fri, 3× a week) is a habit; its year shows here.</p>
          <Button variant="secondary" href="/today" icon="today">
            Back to the board
          </Button>
        </div>
      ) : (
        <>
          <ul className="hh-legend" aria-label="What a square means">
            {LEGEND.map((l) => (
              <li key={l.code}>
                <span className="hh-sq" data-s={l.code} aria-hidden="true" />
                {l.label}
              </li>
            ))}
          </ul>
          <Cards cards={view.habits} year={year} today={view.today} />
          {view.ended.length > 0 && (
            <details className="hh-ended">
              <summary>Ended · {view.ended.length}</summary>
              <Cards cards={view.ended} year={year} today={view.today} />
            </details>
          )}
        </>
      )}
      <HabitHash />
    </div>
  );
}

function Cards({ cards, year, today }: { cards: readonly HabitYearCard[]; year: number; today: string }) {
  if (cards.length === 0) return null;
  return (
    <div className="hh-list">
      {cards.map((c) => (
        <HabitCard key={c.id} card={c} year={year} today={today} />
      ))}
    </div>
  );
}
