/**
 * The You sheet's goal ladder and mastery rows (presentational; the inside
 * of <MasteryCard/>, "Goals and mastery"):
 *
 *   Open goals, Long → Mid → Short (loadGoalLadder's order). Each shows its
 *   title; its track's sigil and name (so a goal filed under the wrong track
 *   is visible); how far it has got (%, '3 of 5 steps'); its due day; once
 *   life counts, the MP it stated when it was set (statedPayoutCopy) and what
 *   closing now would pay, with the reason when that is less; and, past due
 *   and unfinished, 'Carried 0.55' (no debt), with '· reschedule or close it
 *   on Today' once life counts (Today shows Close only then).
 *   Goals closed in the last 30 days, measured as of their close: 'Closed ·
 *   paid ⬡ 4.8 · Duty depth +1', or 'Closed · paid 0: <why>'.
 *   Percentages are goals.ts goalPercent, the one floored figure Today shows too.
 *   A roadmap milestone's goal (krMetric ROADMAP; roadmap.md F16 seam 13)
 *   also shows the quiet chip 'Roadmap · milestone 2 of 3', when its stored
 *   reading was taken ('measured 09:12'; its caption, 'tested by your
 *   reviews · slowest: …', is the progress label goals.ts writes) and the
 *   note on a goal that is no longer measured, word for word as the entry
 *   carries it: 'measures removed by a reset' or 'roadmap archived', or
 *   'replaced by Start again' once a dropped milestone's copy has started
 *   (roadmap-types isSupersededRow: its series is empty, so g is null and it
 *   pays 0). Why it states 0 ('pays nothing · knowledge is paid by reviews')
 *   is its stated line, which goals-server folds. All of it comes from the
 *   item goals-server builds; no roadmap module is read here.
 *   Then ideas mastered, Field tiers and habits by rung. No PRs.
 *
 * Before life counts, nothing here states or previews MP: goals show their
 * progress only. Every figure comes from loadSheet; the copy is pure
 * (goalRowCopy, roadmapRowCopy, rungsLine) so scripts/you-check.ts holds it.
 */
import Link from "next/link";
import { goalAsOf, goalPercent, type GoalLadder as GoalLadderData, type GoalLadderItem, type GoalPayout, type RoadmapGoalEntry } from "@/lib/goals";
import type { HabitRung } from "@/lib/habit";
import { LIFE_TZ, type DayKey } from "@/lib/life-day";
import { GOAL_RULES } from "@/lib/life-economy";
import { TRACK_NAME, TRACK_SIGIL } from "@/lib/life-tracks";
import { measuredLabelOf } from "@/lib/today-board";
import { Chip } from "@/components/ui/Chip";
import { CurrencyGlyph, Icon, Sigil } from "@/components/ui/Icon";
import { mpFigure, shortDayLabel } from "./sheet-math";

// ─── Copy (pure) ────────────────────────────────────────────────────────────

/** Recurring tasks by habit rung (habit.ts rungOf over habitStrength). */
export type RungCounts = Record<HabitRung, number>;

const RUNG_ORDER: readonly HabitRung[] = ["Automatic", "Established", "Forming", "Seeded"];

/** 'Automatic 1 · Established 3 · Forming 2 · Seeded 4' (empty rungs left out); null with no habits. */
export function rungsLine(rungs: RungCounts | null): string | null {
  if (!rungs) return null;
  const parts = RUNG_ORDER.filter((r) => rungs[r] > 0).map((r) => `${r} ${rungs[r].toLocaleString("en-GB")}`);
  return parts.length ? parts.join(" · ") : null;
}

/** 0.55 → '0.55': g to 2 dp, rounded down like the percentage (goalPercent / 100). */
function carriedFigure(g: number): string {
  return (goalPercent(g) / 100).toFixed(2);
}

// ─── A roadmap milestone's goal (F16 seam 13) ──────────────────────────────

/** The entry goals-server's loadGoalLadder attaches to an open ROADMAP goal (GoalLadderItem.roadmap); null on every other goal. */
export function roadmapEntryOf(item: GoalLadderItem): RoadmapGoalEntry | null {
  return item.roadmap ?? null;
}

/**
 * When a stored reading was taken, in the life zone: 'measured 09:12' on
 * today's life day, 'measured Sat' within the past week, 'measured 25 Sep'
 * (with the year when it differs) before that. null for an unreadable time.
 * It is Today's goal card's own rule (today-board.ts measuredLabelOf, which
 * carries the year since fix round 2), so the same goal's reading reads the
 * same on Today and here; the Aim card above it on /you says the same words
 * too (roadmap-copy.ts measuredLabel; you-check holds them together).
 */
export function measuredLabel(observedAt: string, today: DayKey, tz: string = LIFE_TZ): string | null {
  return measuredLabelOf(observedAt, today, tz);
}

export interface RoadmapRowCopy {
  /** 'Roadmap · milestone 2 of 3' (a quiet chip). */
  chip: string | null;
  /** 'measured 09:12': when the reading g is read from was taken (open goals; null with no reading). */
  measured: string | null;
  /** Why the goal is no longer measured, as the entry says it: 'measures removed by a reset', 'roadmap archived', 'replaced by Start again'. */
  note: string | null;
}

/**
 * The roadmap lines of one ladder row, from the entry goals-server attached:
 * the chip, the binding reading's time (the last stored point on or before
 * goalAsOf, the day g is read on; none when the steps set g, as on Today's
 * card, since then no reading binds) and the entry's note. All null without an
 * entry, so every other goal reads exactly as before. The zero reason is not
 * here: goals-server folds it into the item's stated line (goals.ts
 * statedPayoutLine, 'pays nothing · knowledge is paid by reviews'), the one
 * place it is worded.
 */
export function roadmapRowCopy(entry: RoadmapGoalEntry | null, item: Pick<GoalLadderItem, "dueDay" | "closed" | "g">, today: DayKey): RoadmapRowCopy {
  if (!entry) return { chip: null, measured: null, note: null };
  const open = !item.closed;
  const asOf = goalAsOf(today, item.dueDay);
  let point: RoadmapGoalEntry["series"][number] | null = null;
  for (const p of entry.series) if (p.day <= asOf && (!point || p.day >= point.day)) point = p;
  // goals.ts takes g = min(the reading, the steps' share): below the reading, the steps bind.
  const stepsBind = point != null && item.g != null && item.g < Math.min(1, point.g) - 1e-9;
  return {
    chip: entry.of > 0 && entry.ord > 0 ? `Roadmap · milestone ${entry.ord} of ${entry.of}` : null,
    measured: open && point && !stepsBind ? measuredLabel(point.observedAt, today) : null,
    note: entry.note?.trim() || null,
  };
}

export interface GoalRowCopy {
  /** 'Mid · Duty · 62% · 3 of 5 steps · due 12 Dec'; a roadmap goal adds '· measured 09:12'. */
  meta: string;
  /** The stated payout, once life counts ('pays ⬡ 6 × progress from 70%'; a roadmap goal stating 0: 'pays nothing · <why>'). */
  pays: string | null;
  /** A roadmap milestone's goal: 'Roadmap · milestone 2 of 3'. */
  chip: string | null;
  /** A roadmap milestone's goal that is no longer measured: 'measures removed by a reset', 'replaced by Start again'. */
  note: string | null;
  /** 'Carried 0.55' (open, past due, g < 1), with '· reschedule or close it on Today' once life counts. */
  carried: string | null;
  /** What closing now pays, once life counts: 'Closing now pays 0: below 70%', 'Closing now pays ⬡ 4.8'. */
  preview: string | null;
  /** 'Closed · paid ⬡ 4.8 · Duty depth +1' or 'Closed · paid 0: <why>'. */
  closed: string | null;
}

function previewCopy(p: GoalPayout | null): string | null {
  if (!p) return null;
  if (p.pays > 0) return `Closing now pays ⬡ ${mpFigure(p.pays)}${p.why ? `: ${p.why}` : ""}`;
  return p.why ? `Closing now pays 0: ${p.why}` : null;
}

export function goalRowCopy(item: GoalLadderItem, launched: boolean, today: DayKey): GoalRowCopy {
  const rm = roadmapRowCopy(roadmapEntryOf(item), item, today);
  const parts = [GOAL_RULES[item.horizon].name, TRACK_NAME[item.track]];
  // g is null when the goal is not measured (a closed one too: never an invented 0%).
  if (item.g != null) parts.push(`${goalPercent(item.g)}%`);
  if (item.progressLabel) parts.push(item.progressLabel);
  if (!item.closed && item.dueDay) parts.push(`${item.pastDue ? "was due" : "due"} ${shortDayLabel(item.dueDay, today)}`);
  if (rm.measured) parts.push(rm.measured);
  const c = item.closed;
  const closed = c
    ? c.paid > 0
      ? `Closed · paid ⬡ ${mpFigure(c.paid)}${c.depth > 0 ? ` · ${TRACK_NAME[item.track]} depth +${c.depth}` : ""}`
      : `Closed · paid 0${c.why ? `: ${c.why}` : ""}`
    : null;
  return {
    meta: parts.join(" · "),
    pays: launched && !c ? item.copy : null,
    chip: rm.chip,
    note: rm.note,
    // Today has Close and Reschedule only once life counts, so the sheet sends you there only then.
    carried: !c && item.carried != null ? `Carried ${carriedFigure(item.carried)}${launched ? " · reschedule or close it on Today" : ""}` : null,
    preview: launched && !c ? previewCopy(item.preview) : null,
    closed,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

/** A line with an MP figure: the '⬡ 6' becomes the mp glyph and the figure, kept together. */
function GlyphText({ text }: { text: string }) {
  const at = text.indexOf("⬡ ");
  if (at < 0) return <>{text}</>;
  const rest = text.slice(at + 2);
  const end = rest.search(/[\s:]|$/);
  return (
    <>
      {text.slice(0, at)}
      <span className="cur">
        <CurrencyGlyph kind="mp" />
        {rest.slice(0, end)}
        <span className="sr-only"> MP</span>
      </span>
      {rest.slice(end)}
    </>
  );
}

function GoalRow({ item, launched, today }: { item: GoalLadderItem; launched: boolean; today: DayKey }) {
  const copy = goalRowCopy(item, launched, today);
  return (
    <div className={item.closed ? "mo gl-row gl-closed" : "mo gl-row"}>
      <span className="art">
        <Sigil track={TRACK_SIGIL[item.track]} />
      </span>
      <div className="mo-body">
        <b className="gl-title">{item.title}</b>
        {copy.chip && (
          <span className="gl-line">
            <Chip>{copy.chip}</Chip>
          </span>
        )}
        <span className="t-meta gl-line">{copy.meta}</span>
        {copy.pays && (
          <span className="t-meta gl-line">
            <GlyphText text={copy.pays} />
          </span>
        )}
        {copy.preview && (
          <span className="t-meta gl-line">
            <GlyphText text={copy.preview} />
          </span>
        )}
        {copy.carried && <span className="t-meta gl-line gl-carried">{copy.carried}</span>}
        {copy.note && <span className="t-meta gl-line">{copy.note}</span>}
        {copy.closed && (
          <span className="t-meta gl-line">
            <GlyphText text={copy.closed} />
          </span>
        )}
      </div>
    </div>
  );
}

export function GoalLadder({
  ladder,
  launched,
  today,
  mastered,
  tiers,
  rungs,
  pays,
}: {
  ladder: GoalLadderData | null;
  launched: boolean;
  today: DayKey;
  mastered: number;
  tiers: { established: number; highest: string | null; highestField: string | null };
  rungs: RungCounts | null;
  pays: { points: number; level: number };
}) {
  const open = ladder?.open ?? [];
  const closed = ladder?.closed ?? [];
  const habits = rungs ? RUNG_ORDER.reduce((n, r) => n + rungs[r], 0) : 0;
  const rungText = rungsLine(rungs);
  return (
    <>
      {open.map((g) => (
        <GoalRow key={g.id} item={g} launched={launched} today={today} />
      ))}
      {closed.length > 0 && (
        <>
          <p className="t-eyebrow gl-sub">Closed in the last 30 days</p>
          {closed.map((g) => (
            <GoalRow key={g.id} item={g} launched={launched} today={today} />
          ))}
        </>
      )}
      {ladder && open.length === 0 && closed.length === 0 && (
        <div className="mo">
          <span className="art">
            <Icon name="flag" />
          </span>
          <div className="mo-body">
            <b>No goals yet.</b>
            <span className="t-meta gl-line">
              Capture one with <span className="t-mono">goal: read 12 books by dec</span>.
            </span>
          </div>
        </div>
      )}
      <div className="mo">
        <span className="art">
          <Sigil track="know" />
        </span>
        <div className="mo-body">
          <b>
            {mastered.toLocaleString("en-GB")} {mastered === 1 ? "idea" : "ideas"} mastered
          </b>
          <span className="t-meta gl-line">
            Each pays {pays.points} MP the day it reaches level {pays.level}.
          </span>
        </div>
      </div>
      <div className="mo">
        <span className="art">
          <Sigil track="craft" />
        </span>
        <div className="mo-body">
          <b>
            {tiers.established} {tiers.established === 1 ? "Field" : "Fields"} Established or above
          </b>
          <span className="t-meta gl-line">
            {tiers.highest && tiers.highestField ? `Highest: ${tiers.highestField}, ${tiers.highest}.` : "No Field has a tier yet."}{" "}
            <Link className="link" href="/library">
              Library
            </Link>
          </span>
        </div>
      </div>
      {rungs && (
        <div className="mo">
          <span className="art">
            <Icon name="flame" />
          </span>
          <div className="mo-body">
            <b>{habits === 0 ? "No habits yet" : `${habits.toLocaleString("en-GB")} ${habits === 1 ? "habit" : "habits"} by rung`}</b>
            <span className="t-meta gl-line">{rungText ?? "A repeating task climbs Seeded, Forming, Established, Automatic as you keep it."}</span>
          </div>
        </div>
      )}
    </>
  );
}
