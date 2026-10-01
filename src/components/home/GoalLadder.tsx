/**
 * The You sheet's goal ladder and mastery rows (presentational; the inside
 * of <MasteryCard/>, "Goals and mastery"):
 *
 *   Open goals, Long → Mid → Short (loadGoalLadder's order). Each shows its
 *   title; its track's sigil and name (so a goal filed under the wrong track
 *   is visible); how far it has got (%, '3 of 5 steps'); its due day; once
 *   life counts, the MP it stated when it was set (statedPayoutCopy) and what
 *   closing now would pay, with the reason when that is less; and, past due
 *   and unfinished, 'Carried 0.55 · reschedule or close it on Today' (no debt).
 *   Goals closed in the last 30 days: 'Closed · paid ⬡ 4.8 · Duty depth +1',
 *   or 'Closed · paid 0: <why>'.
 *   Then ideas mastered, Field tiers and habits by rung. No PRs.
 *
 * Before life counts, nothing here states or previews MP: goals show their
 * progress only. Every figure comes from loadSheet; the copy is pure
 * (goalRowCopy, rungsLine) so scripts/you-check.ts holds it.
 */
import Link from "next/link";
import type { GoalLadder as GoalLadderData, GoalLadderItem, GoalPayout } from "@/lib/goals";
import type { HabitRung } from "@/lib/habit";
import type { DayKey } from "@/lib/life-day";
import { GOAL_RULES } from "@/lib/life-economy";
import { TRACK_NAME, TRACK_SIGIL } from "@/lib/life-tracks";
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

/** g as a whole percentage, never rounded up past a bar (0.6999 is 69%). */
function percentOf(g: number): string {
  return `${Math.floor(Math.max(0, Math.min(1, g)) * 100 + 1e-9)}%`;
}

/** 0.55 → '0.55': g to 2 dp, rounded down like the percentage. */
function carriedFigure(g: number): string {
  return (Math.floor(Math.max(0, Math.min(1, g)) * 100 + 1e-9) / 100).toFixed(2);
}

export interface GoalRowCopy {
  /** 'Mid · Duty · 62% · 3 of 5 steps · due 12 Dec'. */
  meta: string;
  /** The stated payout, once life counts ('pays ⬡ 6 × progress from 70%'). */
  pays: string | null;
  /** 'Carried 0.55 · reschedule or close it on Today' (open, past due, g < 1). */
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
  const parts = [GOAL_RULES[item.horizon].name, TRACK_NAME[item.track]];
  if (item.g != null) parts.push(percentOf(item.g));
  if (item.progressLabel) parts.push(item.progressLabel);
  if (!item.closed && item.dueDay) parts.push(`${item.pastDue ? "was due" : "due"} ${shortDayLabel(item.dueDay, today)}`);
  const c = item.closed;
  const closed = c
    ? c.paid > 0
      ? `Closed · paid ⬡ ${mpFigure(c.paid)}${c.depth > 0 ? ` · ${TRACK_NAME[item.track]} depth +${c.depth}` : ""}`
      : `Closed · paid 0${c.why ? `: ${c.why}` : ""}`
    : null;
  return {
    meta: parts.join(" · "),
    pays: launched && !c ? item.copy : null,
    carried: !c && item.carried != null ? `Carried ${carriedFigure(item.carried)} · reschedule or close it on Today` : null,
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
