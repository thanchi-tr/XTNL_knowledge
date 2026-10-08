"use client";

/**
 * The task drawer's month: a small Monday-first calendar with a check on each day this task or habit was done (a
 * done, late, minimum or made-up tick), a dot on a day it was missed, today ringed. ‹ › move a month; it never goes
 * past the current month. Read through the taskMonth action when the drawer opens (nothing is written).
 */
import { useEffect, useState } from "react";
import type { DayKey } from "@/lib/life-day";
import { WEEKDAY_INITIALS, monthGridOf, monthKeyOf, monthLabelOf, shiftMonth, shownStyleOf, type MonthKey, type TaskDayMark, type TaskStyle } from "@/lib/task-style";
import { taskMonth } from "@/app/actions/task-style";

type Loader = (templateId: string, month: MonthKey) => Promise<{ ok: true; value: { month: MonthKey; marks: Record<DayKey, TaskDayMark> } } | { ok: false; error: string }>;

export function TaskMonth({ templateId, title, today, style, load = taskMonth }: { templateId: string; title: string; today: DayKey; style?: TaskStyle | null; load?: Loader }) {
  const current = monthKeyOf(today);
  const [month, setMonth] = useState<MonthKey>(current);
  const [data, setData] = useState<{ month: MonthKey; marks: Record<DayKey, TaskDayMark> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    load(templateId, month).then((res) => {
      if (!live) return;
      if (res.ok) {
        setData(res.value);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [templateId, month, load]);
  const marks = data && data.month === month ? data.marks : null;
  const done = marks ? Object.values(marks).filter((m) => m === "done").length : 0;
  const hex = shownStyleOf(style).hex;
  return (
    <div className="tsk-month" aria-label={`${title}: ${monthLabelOf(month)}`}>
      <div className="tsk-month-h">
        <button type="button" className="tsk-nav" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <span className="tsk-month-t">
          {monthLabelOf(month)}
          <span className="t-meta"> · {marks ? `${done} day${done === 1 ? "" : "s"} done` : "…"}</span>
        </span>
        <button type="button" className="tsk-nav" aria-label="Next month" disabled={month >= current} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
      </div>
      <table className="tsk-cal" style={{ ["--tsk-c" as string]: hex }}>
        <thead>
          <tr>
            {WEEKDAY_INITIALS.map((d, i) => (
              <th key={i} scope="col" aria-hidden="true">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthGridOf(month).map((week, wi) => (
            <tr key={wi}>
              {week.map((day, di) => {
                if (!day) return <td key={di} />;
                const mark = marks?.[day] ?? null;
                const label = `${Number(day.slice(8))}${mark === "done" ? ", done" : mark === "missed" ? ", missed" : ""}`;
                return (
                  <td key={di} data-mark={mark ?? undefined} data-today={day === today ? "" : undefined} data-future={day > today ? "" : undefined} aria-label={label}>
                    <span className="tsk-d">{Number(day.slice(8))}</span>
                    {mark === "done" && (
                      <svg className="tsk-ck" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 12.5l4.5 4.5L19 7.5" />
                      </svg>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="t-meta tsk-err">{error}</p>}
    </div>
  );
}
