"use client";

/**
 * One habit's year (Tasks › Habits): the header (its glyph in its hue, its name, its rule in words and its minimum
 * version, the % kept), the year as a Monday-first grid of small squares (habit-history.ts codes), and the footer
 * (current and best streak, this week). The grid is an ARIA grid with one tab stop (a roving tabindex): the arrow
 * keys move a week or a day, Home/End the row, Ctrl+Home/End the year; Enter, Space or a click opens the day's
 * popover under the grid (the date, the state in words, Record yesterday for yesterday, ‹ › a day at a time), and
 * Escape or a press outside closes it. Read-only: nothing here writes.
 */
import Link from "next/link";
import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { addDays, daysBetween, type DayKey } from "@/lib/life-day";
import { RECORD_YESTERDAY_HREF } from "@/lib/shortcuts";
import { TASK_ICONS } from "@/lib/task-style";
import {
  dayDetailOf,
  dayLongLabel,
  dayShortLabel,
  dayStateWord,
  moveInGrid,
  yearDaysOf,
  yearGridOf,
  type DayCode,
  type HabitYearCard,
} from "@/lib/habit-history";

export function HabitCard({ card, year, today }: { card: HabitYearCard; year: number; today: DayKey }) {
  const grid = useMemo(() => yearGridOf(year), [year]);
  const days = useMemo(() => yearDaysOf(year), [year]);
  const todayIndex = days.indexOf(today);
  const [focus, setFocus] = useState(todayIndex >= 0 ? todayIndex : 0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const uid = useId();
  const headId = `${uid}-h`;
  const sumId = `${uid}-s`;
  const popId = `${uid}-p`;

  const codeAt = (i: number) => card.days.charAt(i) as DayCode;
  const cellEl = (i: number) => gridRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null;

  // Opened at the current month: the year scrolls inside its card (never the page) when it is wider.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const cell = cellEl(focus);
    if (!scroller || !cell || scroller.scrollWidth <= scroller.clientWidth) return;
    scroller.scrollLeft = Math.max(0, cell.offsetLeft + cell.offsetWidth + 24 - scroller.clientWidth);
    // Mount only: later moves scroll the focused square into view themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A keyboard move (or a step in the popover) takes the grid's one tab stop with it.
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const el = cellEl(focus);
    if (!el) return;
    if (!popRef.current?.contains(document.activeElement)) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focus]);

  // The popover sits under the grid, its caret at the square (placed before paint); it follows the grid's own scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const wrap = wrapRef.current;
      const scroller = scrollRef.current;
      const cell = cellEl(focus);
      const pop = popRef.current;
      if (!wrap || !scroller || !cell || !pop) return;
      const wr = wrap.getBoundingClientRect();
      const cr = cell.getBoundingClientRect();
      const sr = scroller.getBoundingClientRect();
      const width = pop.offsetWidth;
      const centre = cr.left + cr.width / 2 - wr.left;
      const left = Math.min(Math.max(0, centre - width / 2), Math.max(0, wr.width - width));
      pop.style.left = `${left}px`;
      pop.style.top = `${sr.bottom - wr.top + 6}px`;
      pop.style.setProperty("--hh-caret", `${Math.min(Math.max(12, centre - left), width - 12)}px`);
    };
    place();
    const scroller = scrollRef.current;
    scroller?.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      scroller?.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [open, focus]);

  // A press outside the grid and its popover closes the popover.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const move = (j: number) => {
    if (j < 0 || j >= days.length) return;
    moved.current = true;
    setFocus(j);
  };
  const close = () => {
    setOpen(false);
    cellEl(focus)?.focus({ preventScroll: true });
  };

  const rows = [];
  for (let r = 0; r < 7; r++) {
    const cells = [];
    for (let c = 0; c < grid.cols; c++) {
      const i = c * 7 + r - grid.offset;
      if (i < 0 || i >= days.length) {
        cells.push(<div key={c} role="gridcell" className="hh-d" data-pad="" aria-hidden="true" />);
        continue;
      }
      const day = days[i];
      const code = codeAt(i);
      const current = i === focus;
      cells.push(
        <div
          key={c}
          role="gridcell"
          className="hh-d"
          data-i={i}
          data-s={code}
          data-today={day === today ? "" : undefined}
          tabIndex={current ? 0 : -1}
          aria-label={`${dayShortLabel(day)}: ${dayStateWord(code, card.notes[day], day, today)}`}
          aria-haspopup="dialog"
          aria-expanded={current ? open : undefined}
          aria-controls={current && open ? popId : undefined}
        />
      );
    }
    rows.push(
      <div key={r} role="row" className="hh-row">
        {cells}
      </div>
    );
  }

  const day = days[focus];
  const code = codeAt(focus);
  const yesterday = addDays(today, -1);
  const glyph = TASK_ICONS[card.icon ?? "check"];

  return (
    <article className="card hh-card" id={card.id} data-hue={card.hue} aria-labelledby={headId}>
      <header className="hh-head">
        <span className="hh-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d={glyph} />
          </svg>
        </span>
        <div className="hh-name">
          <h2 id={headId} className="hh-title" tabIndex={-1}>
            {card.title}
          </h2>
          <p className="hh-rule">
            {card.rule}
            {card.mvv ? ` · minimum: ${card.mvv}` : ""}
          </p>
        </div>
        <div className="hh-score" aria-hidden="true">
          <p className="hh-pct">{card.percent == null ? "–" : `${card.percent}%`}</p>
          {card.atMinimum && <p className="hh-min">{card.atMinimum}</p>}
        </div>
      </header>
      <p id={sumId} className="sr-only">
        {card.summary}
      </p>

      <div
        ref={wrapRef}
        className="hh-gridwrap"
        onKeyDown={(e) => {
          if (e.key !== "Escape" || !open) return;
          e.preventDefault();
          e.stopPropagation();
          close();
        }}
      >
        <div ref={scrollRef} className="hh-scroll">
          <div className="hh-year" style={{ "--hh-cols": grid.cols } as CSSProperties}>
            <div className="hh-months" aria-hidden="true">
              {grid.months.map((m) => (
                <span key={m.label} style={{ "--col": m.col } as CSSProperties}>
                  {m.label}
                </span>
              ))}
            </div>
            <div
              ref={gridRef}
              role="grid"
              className="hh-grid"
              aria-label={`${card.title}, ${year}: a square a day`}
              aria-describedby={sumId}
              onClick={(e) => {
                const el = (e.target as HTMLElement).closest<HTMLElement>("[data-i]");
                if (!el) return;
                const i = Number(el.dataset.i);
                setFocus(i);
                setOpen((o) => !(o && i === focus));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen((o) => !o);
                  return;
                }
                const j = moveInGrid(focus, e.key, e.ctrlKey || e.metaKey, grid);
                if (j == null) return;
                e.preventDefault();
                move(j);
              }}
            >
              {rows}
            </div>
          </div>
        </div>

        {open && (
          <div
            ref={popRef}
            id={popId}
            className="hh-pop"
            role="dialog"
            aria-label={`${card.title}, ${dayLongLabel(day)}`}
          >
            <p className="hh-pop-d">{dayLongLabel(day)}</p>
            <p className="hh-pop-s" aria-live="polite">
              <span className="hh-sq" data-s={code} aria-hidden="true" />
              <span>{dayDetailOf(code, card.notes[day], day, today, card.mvv)}</span>
            </p>
            <div className="hh-pop-a">
              {day === yesterday && code === "o" ? (
                <Link className="hh-pop-link" href={RECORD_YESTERDAY_HREF}>
                  Record yesterday ›
                </Link>
              ) : (
                <span className="hh-pop-gap" />
              )}
              <button type="button" className="hh-pop-btn" aria-label="Previous day" disabled={focus === 0} onClick={() => move(focus - 1)}>
                ‹
              </button>
              <button type="button" className="hh-pop-btn" aria-label="Next day" disabled={focus === days.length - 1 || daysBetween(today, day) >= 0} onClick={() => move(focus + 1)}>
                ›
              </button>
              <button type="button" className="hh-pop-btn" aria-label="Close" onClick={close}>
                ×
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Each part of the line keeps together (never "this week 2 of" / "3" at 344 px). */}
      <p className="hh-foot">
        {card.foot.split(" · ").map((part, k) => (
          <Fragment key={k}>
            {k > 0 && " · "}
            <span className="hh-keep">{part}</span>
          </Fragment>
        ))}
      </p>
    </article>
  );
}
