"use client";

/**
 * Week quests (lane R5; F13, F14, F17; final-today-quests.html and the Now
 * section of final-roadmap.html). One component, three variants:
 *
 *   today    Today's quiet card inside .o9, after GoalsStrip (lane T mounts it
 *            as questsSlot). "Week quests · Milestone 2" with "until Sun", the
 *            evidence legend once, at most WEEK_QUEST_ROWS_TODAY rows (open
 *            first) and an "n more" toggle, a per-kind footer. RAISE and ADD
 *            are links with a thin Meter; PRACTICE and STEP are one-line
 *            buttons that dispatch SEEK_TEMPLATE_EVENT (never a '#t-' link,
 *            never data-template-id); CHECKPOINT links to the roadmap's
 *            checkpoint. All done: one collapsed line. While lane T's wrapper
 *            carries data-compact (Close the day is prominent) the card is its
 *            one summary line until opened. No Ask, no count, no red, no link
 *            to /review, no celebration beyond a row's check.
 *   aim      The Aim card's one line: "Week quests · 2 of 5 done · Today".
 *   roadmap  The Now section: every row with its evidence in words, RAISE's due
 *            days, "the milestone counts 80% of these", the basis sheet, the
 *            lag line and notes; nothing here is red either.
 *
 * Every figure is the row's branded progress (Measured | Recorded |
 * SelfReported) with its caption; every count carries its unit. Labels are
 * the frozen set's own (YoursText, CodeText and Domain names only).
 */
import Link from "next/link";
import { useId, useState } from "react";
import { Icon, Sigil } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { ChipButton } from "@/components/ui/Chip";
import { SectionHeader } from "@/components/ui/Tabs";
import { cx } from "@/components/ui/cx";
import type { EvidenceValue, WeekQuestRow, WeekQuestVariant, WeekQuestsView } from "@/lib/roadmap-types";
import { seekTemplate } from "./roadmap-events";
import {
  PRACTICE_KEEP_SHARE_LINE,
  WEEK_QUEST_CAPTIONS,
  addCountsLine,
  pastDueLine,
  placeSuffix,
  weekQuestsAside,
  weekQuestsFooter,
  weekQuestsHeading,
  weekQuestsLegend,
  weekQuestsSummary,
  windowLabel,
} from "./roadmap-copy";
import { ROADMAP_CHECKPOINT_HREF, ROADMAP_NOW_HREF, TODAY_HREF } from "./roadmap-links";
import {
  notesShownOf,
  practiceNameOf,
  weekQuestAccessibleName,
  weekQuestCountOf,
  weekQuestKindsOf,
  weekQuestProgressOf,
  weekQuestRowsShown,
} from "./roadmap-ui-model";
import { RoadmapGlyph } from "./RoadmapGlyph";
import "./roadmap.css";

export interface WeekQuestsProps {
  variant: WeekQuestVariant;
  view: WeekQuestsView;
  /** The roadmap variant: "Log a score" opens the checkpoint sheet. */
  onLogCheckpoint?: () => void;
  /** The roadmap variant: "How these were set" opens the basis sheet. */
  onShowBasis?: () => void;
  /** The roadmap variant: today's life day (dates without a year). */
  today?: string;
  /** The roadmap variant: sentences the page already shows (the QUESTS_BEHIND banner), so a note says them once. */
  shownElsewhere?: readonly string[];
}

/**
 * The set was computed on this request and recorded nowhere: writes off and
 * not frozen. A set the live app froze is its stored record, and reads as one
 * (the contract §9.3: only values computed here read "not recorded on this server").
 */
export function liveHere(view: Pick<WeekQuestsView, "writesOff" | "frozen">): boolean {
  return view.writesOff && !view.frozen;
}

/** Whether a set shows on Today at all: an OPEN week with at least one row. */
export function weekQuestsShowOnToday(view: WeekQuestsView | null | undefined): view is WeekQuestsView {
  return Boolean(view && view.state === "OPEN" && view.rows.length > 0);
}

function KindGlyph({ row }: { row: WeekQuestRow }) {
  if (row.done) return <Icon name="check" />;
  switch (row.kind) {
    case "RAISE":
      return <Sigil track="know" />;
    case "ADD":
      return <Icon name="plus" />;
    case "PRACTICE":
      return <Sigil track="craft" />;
    case "STEP":
      return <RoadmapGlyph name="step" />;
    case "CHECKPOINT":
      return <RoadmapGlyph name="target" />;
  }
}

function fraction(row: WeekQuestRow): number {
  return row.count > 0 ? Math.min(1, weekQuestProgressOf(row) / row.count) : 0;
}

function RowMeter({ row }: { row: WeekQuestRow }) {
  if (row.kind !== "RAISE" && row.kind !== "ADD") return null;
  return <Meter thin value={fraction(row)} label={`${row.label}: ${weekQuestCountOf(row)}`} valueText={weekQuestCountOf(row)} />;
}

/** Today's row: a link (RAISE, ADD, CHECKPOINT) or a seek button (PRACTICE, STEP). */
function TodayRow({ row }: { row: WeekQuestRow }) {
  const name = weekQuestAccessibleName(row);
  const cls = cx(row.done && "rm-quest-done");
  if (row.kind === "RAISE" || row.kind === "ADD") {
    const href = row.href ?? ROADMAP_NOW_HREF;
    return (
      <Link className={cx("rm-quest-row", cls)} href={href} aria-label={name}>
        <KindGlyph row={row} />
        <span className="rm-q-lbl">{row.label}</span>
        <span className="rm-q-cnt num">{weekQuestCountOf(row)}</span>
        <RowMeter row={row} />
        {row.kind === "RAISE" && row.dueLine && !row.done && <p className="rm-q-ev">{row.dueLine}</p>}
        {row.slipLine && <p className="rm-q-ev">{row.slipLine}</p>}
        {row.kind === "ADD" && row.quotaLine && !row.done && <p className="rm-q-ev">{row.quotaLine}</p>}
      </Link>
    );
  }
  if (row.kind === "CHECKPOINT") {
    return (
      <Link className={cx("rm-quest-line", cls)} href={row.href ?? ROADMAP_CHECKPOINT_HREF} aria-label={name}>
        <KindGlyph row={row} />
        <span className="rm-q-lbl">
          {row.label}
          <span className="rm-q-dim"> · {row.done ? "logged · done" : "doesn't move your progress"}</span>
        </span>
      </Link>
    );
  }
  const head = row.kind === "PRACTICE" ? practiceNameOf(row.label) : row.label;
  const tail = row.kind === "PRACTICE" ? ` · ${weekQuestCountOf(row)}` : row.done ? " · done" : "";
  return (
    <button
      type="button"
      className={cx("rm-quest-line", cls)}
      aria-label={name}
      onClick={() => {
        if (row.seekTemplateId) seekTemplate(row.seekTemplateId);
      }}
    >
      <KindGlyph row={row} />
      <span className="rm-q-lbl">
        {head}
        <span className="rm-q-dim">
          {tail}
          {!row.done ? placeSuffix(row.place) : ""}
        </span>
      </span>
    </button>
  );
}

function TodayCard({ view }: { view: WeekQuestsView }) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const kinds = weekQuestKindsOf(view);
  const allDone = view.total > 0 && view.done >= view.total;
  const { shown, hidden } = weekQuestRowsShown(view.rows, expanded);
  const heading = weekQuestsHeading(view.milestoneOrd);
  const summary = weekQuestsSummary(view.milestoneOrd, view.done, view.total);

  const summaryLine = (
    <button type="button" className={cx("rm-quest-one", allDone && "rm-quest-done")} aria-expanded={false} onClick={() => setOpen(true)}>
      {allDone ? <Icon name="check" /> : <RoadmapGlyph name="cal" />}
      <b>{heading}</b>
      <span className="rm-q-n">{allDone ? `all ${view.total} done` : `${view.done} of ${view.total} done`}</span>
      <Icon name="chev" />
    </button>
  );

  // All done and not opened: one collapsed line (it can be expanded). Nothing else plays.
  if (allDone && !open) {
    return (
      <section className="rm-quests-today" aria-label={summary}>
        <div className="card rm-quest">{summaryLine}</div>
      </section>
    );
  }

  return (
    <section className="rm-quests-today" aria-label={heading} data-open={open ? "1" : undefined}>
      <div className="rm-quests-compact">
        <div className="card rm-quest">{summaryLine}</div>
      </div>
      <div className="rm-quests-full">
        <SectionHeader
          title={heading}
          aside={
            <Link className="rm-hit" href={ROADMAP_NOW_HREF}>
              {weekQuestsAside(view.weekEnd, liveHere(view))}
            </Link>
          }
        />
        <div className="card rm-quest">
          <p className="rm-quest-legend">{weekQuestsLegend(kinds)}</p>
          <div id={listId}>
            {shown.map((row) => (
              <TodayRow key={row.ord} row={row} />
            ))}
          </div>
          {(hidden > 0 || expanded) && (
            <button type="button" className="rm-quest-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded((e) => !e)}>
              <RoadmapGlyph name="down" />
              {expanded ? "Show fewer" : `${hidden} more`}
            </button>
          )}
          <p className="rm-quest-foot">{weekQuestsFooter(kinds, view.milestoneOrd, view.level)}</p>
        </div>
      </div>
    </section>
  );
}

/** The Aim card's line for a set's counts ("Week quests · 2 of 5 done · Today"). */
export function WeekQuestsLine({ done, total, className }: { done: number; total: number; className?: string }) {
  const allDone = total > 0 && done >= total;
  return (
    <Link className={cx("rm-quest-one", allDone && "rm-quest-done", className)} href={TODAY_HREF}>
      {allDone ? <Icon name="check" /> : <RoadmapGlyph name="cal" />}
      <b>Week quests</b>
      <span className="rm-q-n">{allDone ? `all ${total} done · Today` : `${done} of ${total} done · Today`}</span>
      <Icon name="chev" />
    </Link>
  );
}

/** One caption line: the row's evidence in words (its figure's caption). */
function Evidence({ figure, extra }: { figure: EvidenceValue; extra?: string | null }) {
  return (
    <p className="rm-q-ev">
      {figure.caption}
      {extra ? ` · ${extra}` : ""}
    </p>
  );
}

function RoadmapRow({ row, view, onLogCheckpoint }: { row: WeekQuestRow; view: WeekQuestsView; onLogCheckpoint?: () => void }) {
  return (
    <div className={cx("rm-quest-row", row.done && "rm-quest-done")}>
      <KindGlyph row={row} />
      <span className="rm-q-lbl">{row.label}</span>
      <span className="rm-q-cnt num">{weekQuestCountOf(row)}</span>
      <RowMeter row={row} />
      {row.kind === "RAISE" && (
        <>
          <Evidence figure={row.figure} />
          {row.dueLine && <p className="rm-q-ev">{row.dueLine}</p>}
          {row.slipLine && <p className="rm-q-ev">{row.slipLine}</p>}
        </>
      )}
      {row.kind === "ADD" && (
        <>
          <Evidence figure={row.figure} extra={row.quotaLine} />
          <p className="rm-q-ev">{addCountsLine(view.milestoneOrd, view.level)}</p>
          {row.href && (
            <Link className="link rm-q-lnk" href={row.href}>
              Add a card here
            </Link>
          )}
        </>
      )}
      {row.kind === "PRACTICE" && (
        <>
          <Evidence figure={row.figure} extra={PRACTICE_KEEP_SHARE_LINE} />
          {row.href && !row.done && (
            <Link className="link rm-q-lnk" href={row.href}>
              On Today
            </Link>
          )}
        </>
      )}
      {row.kind === "STEP" && (
        <>
          <p className="rm-q-ev">{WEEK_QUEST_CAPTIONS.STEP}</p>
          {row.href && !row.done && (
            <Link className="link rm-q-lnk" href={row.href}>
              On Today
            </Link>
          )}
        </>
      )}
      {row.kind === "CHECKPOINT" && (
        <>
          <p className="rm-q-ev">{WEEK_QUEST_CAPTIONS.CHECKPOINT}</p>
          {!row.done && onLogCheckpoint && (
            <button type="button" className="link rm-q-lnk rm-ilink" onClick={onLogCheckpoint}>
              Log a score
            </button>
          )}
        </>
      )}
    </div>
  );
}

function RoadmapVariant({ view, onLogCheckpoint, onShowBasis, today, shownElsewhere = [] }: WeekQuestsProps) {
  const kinds = weekQuestKindsOf(view);
  const notes = notesShownOf(view.notes, shownElsewhere);
  const span = windowLabel(view.weekStart, view.weekEnd, today);
  const fixed = view.frozen ? "fixed for the week" : view.writesOff ? "not recorded on this server" : "fixed when the week's first run records it";
  return (
    <div className="rm-ms-sec" id="week-quests">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">Week quests</span>
        <span className="rm-cap">
          {span} · {fixed}
        </span>
      </div>
      {view.state === "PAST_DUE" && <p className="rm-lag t-meta">{pastDueLine(view.milestoneOrd, null)}. No week quests this week.</p>}
      {view.state === "HELD" && <p className="rm-lag t-meta">A held week: no week quests, and nothing is asked of it.</p>}
      {notes.map((n) => (
        <p key={n} className="rm-lag t-meta">
          {n}
        </p>
      ))}
      {view.rows.length > 0 && (
        <div className="rm-quest">
          {view.rows.map((row) => (
            <RoadmapRow key={row.ord} row={row} view={view} onLogCheckpoint={onLogCheckpoint} />
          ))}
        </div>
      )}
      {view.state === "OPEN" && view.rows.length === 0 && <p className="rm-lag t-meta">No week quests this week: the basis says why.</p>}
      {onShowBasis && view.basis.length > 0 && (
        <div className="rm-acts">
          <ChipButton onClick={onShowBasis}>How these were set</ChipButton>
        </div>
      )}
      {view.rows.length > 0 && <p className="rm-cap" style={{ marginTop: 8 }}>{weekQuestsFooter(kinds, view.milestoneOrd, view.level)}</p>}
    </div>
  );
}

export function WeekQuests(props: WeekQuestsProps) {
  const { variant, view } = props;
  if (variant === "aim") {
    if (view.state !== "OPEN" || view.total === 0) return null;
    return <WeekQuestsLine done={view.done} total={view.total} />;
  }
  if (variant === "roadmap") return <RoadmapVariant {...props} />;
  if (!weekQuestsShowOnToday(view)) return null;
  return <TodayCard view={view} />;
}
