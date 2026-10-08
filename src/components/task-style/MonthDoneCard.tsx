"use client";

/**
 * You › Sheet: the month's done tasks. A Monday-first calendar; each day shows the tasks and habits done that day as
 * their icons in their colours (TaskStyle; the check in slate without one), and hovering, focusing or tapping an icon
 * shows the task's name. Under it, the month's tasks with their icons and how many days each was done (the names at a
 * glance on a phone). ‹ › move a month through the monthDone action; never past the current month.
 */
import { useEffect, useId, useState, type FocusEvent, type MouseEvent } from "react";
import type { DayKey } from "@/lib/life-day";
import { WEEKDAY_INITIALS, monthGridOf, monthKeyOf, monthLabelOf, shiftMonth, type MonthDoneTask, type MonthKey } from "@/lib/task-style";
import { monthDone } from "@/app/actions/task-style";
import { TaskIcon } from "./TaskIcon";

type Loader = (month: MonthKey) => Promise<{ ok: true; value: { month: MonthKey; days: Record<DayKey, MonthDoneTask[]> } } | { ok: false; error: string }>;

/** Icons a day cell shows before "+n". */
const DAY_ICONS_MAX = 6;

export function MonthDoneCard({
  today,
  initial,
  load = monthDone,
}: {
  today: DayKey;
  /** The current month, read on the server (null: it couldn't be read; the card reads it again). */
  initial: { month: MonthKey; days: Record<DayKey, MonthDoneTask[]> } | null;
  load?: Loader;
}) {
  const id = useId();
  const current = monthKeyOf(today);
  const [month, setMonth] = useState<MonthKey>(current);
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (data && data.month === month) return;
    let live = true;
    load(month).then((res) => {
      if (!live) return;
      if (res.ok) {
        setData(res.value);
        setError(null);
      } else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [month, data, load]);

  const days = data && data.month === month ? data.days : null;
  const tally = new Map<string, { task: MonthDoneTask; n: number }>();
  for (const list of Object.values(days ?? {})) for (const t of list) tally.set(t.templateId, { task: t, n: (tally.get(t.templateId)?.n ?? 0) + 1 });
  const legend = [...tally.values()].sort((a, b) => b.n - a.n || a.task.title.localeCompare(b.task.title));
  const ticks = legend.reduce((n, x) => n + x.n, 0);

  const show = (text: string) => (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ text, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 });
  };
  const hide = () => setTip(null);

  return (
    <section className="card pad-l tsk-mdone" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="t-eyebrow" style={{ margin: 0 }}>
        Done this month
      </h2>
      <div className="tsk-month-h">
        <button type="button" className="tsk-nav" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          ‹
        </button>
        <span className="tsk-month-t">
          {monthLabelOf(month)}
          <span className="t-meta"> · {days ? `${ticks} done` : "…"}</span>
        </span>
        <button type="button" className="tsk-nav" aria-label="Next month" disabled={month >= current} onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          ›
        </button>
      </div>
      <table className="tsk-mcal">
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
                const list = days?.[day] ?? [];
                const shown = list.slice(0, DAY_ICONS_MAX);
                const more = list.length - shown.length;
                const n = Number(day.slice(8));
                return (
                  <td key={di} data-today={day === today ? "" : undefined} aria-label={list.length ? `${n}: ${list.map((t) => t.title).join(", ")}` : `${n}: nothing done`}>
                    <span className="tsk-d">{n}</span>
                    {list.length > 0 && (
                      <span className="tsk-icons">
                        {shown.map((t) => (
                          <span key={t.templateId} tabIndex={0} title={t.title} onMouseEnter={show(t.title)} onMouseLeave={hide} onFocus={show(t.title)} onBlur={hide} onClick={show(t.title)}>
                            <TaskIcon style={t} size={14} />
                          </span>
                        ))}
                        {more > 0 && <span className="tsk-more" title={list.slice(DAY_ICONS_MAX).map((t) => t.title).join(", ")}>+{more}</span>}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {legend.length > 0 ? (
        <ul className="tsk-legend" aria-label="Tasks done this month">
          {legend.map(({ task, n }) => (
            <li key={task.templateId}>
              <TaskIcon style={task} size={14} />
              {task.title}
              <span className="t-meta">× {n}</span>
            </li>
          ))}
        </ul>
      ) : (
        days && <p className="t-meta" style={{ margin: 0 }}>Nothing ticked this month yet.</p>
      )}
      {error && <p className="t-meta tsk-err">{error}</p>}
      {tip && (
        <span className="tsk-tip" role="tooltip" style={{ left: Math.max(8, tip.x), top: tip.y }}>
          {tip.text}
        </span>
      )}
    </section>
  );
}
