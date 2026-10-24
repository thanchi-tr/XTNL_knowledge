import "../rules/rules.css";
import "@/components/home/week-decisions.css";
import "@/components/home/week-audit.css";
import type { Metadata } from "next";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, weekStartKeyOf, type DayKey } from "@/lib/life-day";
import { isBackfillDetail, isLaunched, lifeWritesEnabled, weekKeptMintKey, withoutBackfill } from "@/lib/life-economy";
import { lifeMpModelOfWeek } from "@/lib/momentum";
import {
  DISPLAY_ORDER,
  TRACK_NAME,
  TRACK_SIGIL,
  lifeMpInWeek,
  notLaunchedView,
  trackStateAt,
  weekMarkOf,
  type LifeLedger,
} from "@/lib/life-tracks";
import { loadLifeLedger, loadLifeTracks } from "@/lib/life-tracks-server";
import { maybeMaintainLife } from "@/lib/settlement";
import { loadTodayBoard } from "@/lib/tasks";
import { dutyLaunchDay, firstDutyDay, fullDayMintKey, isDutyLaunched, weekReviewKey } from "@/lib/duty-economy";
import { validRestDays, type RestRow } from "@/lib/duty-rule";
import { ruleOf } from "@/lib/today-board";
import {
  REVIEW_BEFORE_LIFE_TEXT,
  dayMonthLabel,
  dutyStandingOf,
  dutyXpLine,
  mustTallyLine,
  nextWeekDays,
  restRefusalOf,
  reviewPendingText,
  reviewPlanOf,
  reviewedWeek,
  weekFactsOf,
  weekdayDateLabel,
  weekdayLong,
  type ReviewedWeek,
  type WeekFacts,
  type WeekFactsInstance,
  type WeekFactsRow,
  type WeekFactsTemplate,
} from "@/lib/rituals";
import { firstWeekJudgement, longDayLabel, mpFigure, pendingWeek, weekdayDayLabel } from "@/components/home/sheet-math";
import { WeekReview, type RestDayOption, type WeekCardData } from "@/components/home/WeekReview";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { readWeekDecisions } from "@/lib/task-decisions-server";
import { weekDecisionsViewOf } from "@/lib/task-decisions";
import { WeekDecisions } from "@/components/home/WeekDecisions";
import { WeekAuditCard } from "@/components/home/WeekAudit";
import { LAST_WEEK_ANCHOR } from "@/lib/audit-decay";
import { loadWeekAudit } from "@/lib/week-audit-server";
import { loadNextWeek } from "@/lib/week-calibration-server";
import { loadMainQuestCard, loadMainQuestWeek } from "@/lib/main-quest-server";
import { loadPastWeeks } from "@/lib/roadmap-quests-server";
import { mainQuestOf, readsPastSprints, sprintStepOf, type SprintStep } from "@/lib/main-quest";
import type { WeekAudit } from "@/lib/week-audit";
import { CurrencyGlyph, Sigil } from "@/components/ui/Icon";
import { SectionHeader } from "@/components/ui/Tabs";

export const metadata: Metadata = { title: "Weekly review" };

// Weeks are judged lazily on reads like this one; the page must never be baked at build time.
export const dynamic = "force-dynamic";

/**
 * /today/week — the last judged week, and the weekly review.
 *
 * Once life counts, the 'Last week' card shows the latest week the judge
 * wrote (every figure from its WEEK rows and mints: the stored reason, the
 * MP paid, the kept-week streak, the week's life MP against the cap). Before
 * a week is judged it says when the first one will be, computed from the
 * judging rule. While the week that just ended is not judged yet (Monday,
 * Tuesday, Wednesday before the judge runs) the card is headed 'Last judged
 * week' and says when that week is.
 *
 * The review of rituals.ts reviewedWeek(today) (Saturday to Wednesday) runs
 * at ?view=run (components/home/WeekReview.tsx), with or without Duty
 * (blueprint decision D13, rituals.ts reviewPlanOf). Before Duty's launch
 * day nothing is settled, so its Duty parts stay hidden (step 1's settled
 * facts, Owed, next week's rest days): step 1 is the last judged week and
 * each daily quest's streak, then the inbox, goals and daily capacity. Once Duty is
 * live, step 1 states the week only as far as settlement has judged it. It
 * ends on the week card only once the judge has written that week.
 * Finishing writes the week's done marker ('week-review:<YYYY-Www>').
 *
 * The Week audit card (blueprint P11, lib/week-audit.ts; inert until
 * AUDIT_LAUNCH_DAY) sits under the last week: the daily quests' completion
 * rate, provisional from Sunday 18:00, as of Monday 04:00 once frozen, final
 * from Wednesday, with the 85% target (only here, never on Today). In the
 * run, step 1 shows it when it is the reviewed week's.
 *
 * Blueprint P15 (D11, D12): the main quest (main-quest-server: the lowest
 * seat whose milestone is under way, else the lowest open seat) adds a Sprint
 * step at the end of the run, only when its sprint has something to show
 * (lib/main-quest sprintStepOf: the reviewed week's share as far as it is
 * written, this week's live count on Saturday and Sunday, "provisional ·
 * final Wed 04:00" until the chain writes it; a held week; or this week's
 * sprint under way). The step list and the card's words key on the same
 * value. It reads only; nothing here writes a verdict.
 *
 * Blueprint P32 (D36): from Monday to Wednesday, when the reviewed week's
 * frozen copy set a calibration for the week after it, step 5 opens with
 * the Next week card (week-calibration-server loadNextWeek: Today's three
 * sizes, the capacity suggestion and the one-tap suggestions). Null at once
 * while AUDIT_LAUNCH_DAY is not in force; a failed read leaves it out.
 */

/** One track's row of the last judged week. */
interface WeekRow {
  track: (typeof DISPLAY_ORDER)[number];
  kept: boolean;
  /** A held week (mostly rest, its floors not met): it bridges the kept-week streak and pays nothing. */
  held: boolean;
  /** The stored reason without 'backfill · ' or the verdict the chip already states. */
  reason: string;
  backfill: boolean;
  /** MP minted for this kept week; null when none was (not kept, backfill, or the cap). */
  mp: number | null;
  /** Consecutive kept weeks ending at this one. */
  streak: number;
}

interface LastWeek {
  weekKey: string;
  monday: DayKey;
  sunday: DayKey;
  backfill: boolean;
  rows: WeekRow[];
  /** Capped life MP dated in that week. */
  used: number;
}

function reasonOf(detail: string): string {
  return withoutBackfill(detail).replace(/^(Kept|Not kept|Held)( · |$)/, "");
}

function lastWeekOf(ledger: LifeLedger, weekKey: string): LastWeek | null {
  const weeks = ledger.weeks.filter((w) => w.weekKey === weekKey);
  if (weeks.length === 0) return null;
  const sunday = weeks[0].sunday;
  const monday = addDays(sunday, -6);
  const streakOf = new Map(trackStateAt(ledger, sunday).map((s) => [s.track, s.keptStreak]));
  const rows: WeekRow[] = [];
  for (const track of DISPLAY_ORDER) {
    const w = weeks.find((x) => x.track === track);
    if (!w) continue;
    const mint = ledger.mints.find((m) => m.key === weekKeptMintKey(track, weekKey));
    rows.push({
      track,
      kept: w.kept,
      held: weekMarkOf(w) === "held",
      reason: reasonOf(w.detail),
      backfill: isBackfillDetail(w.detail),
      mp: mint && mint.qty > 0 ? mint.qty : null,
      streak: streakOf.get(track) ?? 0,
    });
  }
  return { weekKey, monday, sunday, backfill: rows.some((r) => r.backfill), rows, used: lifeMpInWeek(ledger, monday) };
}

function LastWeekCard({ week, today }: { week: LastWeek; today: DayKey }) {
  const kept = week.rows.filter((r) => r.kept).length;
  const held = week.rows.filter((r) => r.held).length;
  // The week that just ended, while it is not judged yet: this card is then the week before.
  const pending = pendingWeek(week.sunday, today);
  return (
    <section id={LAST_WEEK_ANCHOR} aria-labelledby="lw-h">
      <SectionHeader title={pending ? "Last judged week" : "Last week"} />
      <div className="card">
        <h2 id="lw-h" className="lw-head">
          Week of {longDayLabel(week.monday)} · {kept} of {week.rows.length} {week.rows.length === 1 ? "track" : "tracks"} kept
          {held > 0 && ` · ${held} held`}
        </h2>
        {pending && (
          <p className="t-meta lw-pending">
            {pending.due
              ? lifeWritesEnabled()
                ? `The week of ${longDayLabel(pending.monday)} can be judged now: it is judged in the background as this page opens.`
                : `The week of ${longDayLabel(pending.monday)} can be judged now; this server only reads weeks.`
              : `The week of ${longDayLabel(pending.monday)} is judged on ${weekdayDayLabel(pending.judgeDay)}.`}
          </p>
        )}
        <ul className="lw-rows">
          {week.rows.map((r) => (
            <li key={r.track} className="lw-row">
              <Sigil track={TRACK_SIGIL[r.track]} />
              <div className="lw-body">
                <b>{TRACK_NAME[r.track]}</b>
                {r.reason && <span className="t-meta lw-line">{r.reason}</span>}
                <span className="t-meta lw-line">
                  {r.kept && r.backfill && "kept before life MP began · "}
                  {r.kept && !r.backfill && r.mp != null && (
                    <>
                      <span className="cur">
                        <CurrencyGlyph kind="mp" />+{mpFigure(r.mp)}
                      </span>{" "}
                      MP ·{" "}
                    </>
                  )}
                  {r.kept && !r.backfill && r.mp == null && "no MP: the life week's cap was reached · "}
                  {r.held && "held: it bridges the streak and pays nothing · "}
                  kept-week streak {r.streak}
                </span>
              </div>
              {r.held ? (
                <Chip tone="held" held="rest">
                  Held
                </Chip>
              ) : (
                <Chip tone={r.kept ? "kept" : "quiet"}>{r.kept ? "Kept" : "Not kept"}</Chip>
              )}
            </li>
          ))}
        </ul>
        <p className="t-meta lw-foot">
          {week.backfill
            ? "That week closed before life MP began, so it paid none. Its kept weeks still raise each track's depth cap."
            : `Life MP for that week: ${mpFigure(week.used)} of ${mpFigure(lifeMpModelOfWeek(week.monday).weekCap)}`}
        </p>
      </div>
    </section>
  );
}

/** No week judged yet: when the first one is, from the judging rule (or that it is due now). */
function FirstWeekCard({ epochDay, today }: { epochDay: DayKey | null; today: DayKey }) {
  const first = firstWeekJudgement(epochDay ?? today, today);
  const due = first.due;
  const monday = longDayLabel(first.monday);
  return (
    <section aria-labelledby="lw-h">
      <SectionHeader title="Last week" />
      <div className="card pad-l">
        <h2 id="lw-h" className="lw-head-plain">
          {due ? `The week of ${monday} can be judged now` : "No week has been judged yet"}
        </h2>
        <p className="t-meta" style={{ marginTop: 8 }}>
          {due
            ? lifeWritesEnabled()
              ? "It is judged in the background as this page opens; reload in a moment to see it."
              : "This server only reads weeks; the live app judges them."
            : `The first week is judged on ${weekdayDayLabel(first.judgeDay)}, once the last day of the week of ${monday} can no longer be recorded.`}
        </p>
      </div>
    </section>
  );
}

/** What each step covers, by its number: once Duty is live, and before it (when Owed does not run). */
const STEP_LINES: Record<number, readonly [live: string, before: string]> = {
  1: ["Days shown up, musts kept, freezes used and Duty XP, as far as each day is settled; the last judged week.", "The last judged week, kept or not per track with the reason; each daily quest's streak."],
  2: ["Sort what is left to zero, one tap each.", "Sort what is left to zero, one tap each."],
  3: ["Check in on each open goal.", "Check in on each open goal."],
  4: ["Make up, or leave it: it never grows.", ""],
  5: ["Rest days and daily capacity.", "Daily capacity: the minutes a day you plan for."],
  6: ["Your main quest's sprint: the week's share as far as it is written, and this week's rows.", "Your main quest's sprint: the week's share as far as it is written, and this week's rows."],
};

const STEP_COUNT = ["None", "One", "Two", "Three", "Four", "Five", "Six"] as const;

/** The steps that run (rituals.ts reviewPlanOf; the Sprint step only when sprintStepOf found one), as the page lists them before the review starts. */
function StepsList({ live, sprint }: { live: boolean; sprint: boolean }) {
  const steps = reviewPlanOf(live, sprint).steps;
  return (
    <section aria-labelledby="week-steps">
      <SectionHeader id="week-steps" title={`${STEP_COUNT[steps.length]} steps, each skippable`} />
      <ol className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s) => (
          <li key={s.n} className="collapsed" style={{ alignItems: "flex-start", padding: "12px 14px" }}>
            <b className="ink-0" style={{ flex: "0 0 96px" }}>
              {s.name}
            </b>
            <span>{STEP_LINES[s.n][live ? 0 : 1]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── The review's read (Duty live only) ──────────────────────────────────────

/** The templates the week's musts come from: every compulsory one and every one with a pending change, archived included. */
const DUTY_TEMPLATES: Prisma.TaskTemplateWhereInput = {
  kind: { in: ["TASK", "HABIT"] },
  // The personal Board only (work-boards.ts): the weekly review never reads a work tab.
  boardId: null,
  OR: [{ compulsory: true }, { pendingChange: { not: Prisma.DbNull } }],
};

interface ReviewRead {
  epochDay: DayKey | null;
  cursor: DayKey | null;
  templates: WeekFactsTemplate[];
  instances: WeekFactsInstance[];
  rows: WeekFactsRow[];
  /** RestDay rows from the reviewed Monday through the following Sunday (step 5 offers next week's days). */
  restRows: RestRow[];
  marked: boolean;
}

/** One round trip: settings, the musts' templates and instances, the week's ledger rows, rest days and the done marker. */
async function readReview(userId: string, week: ReviewedWeek): Promise<ReviewRead> {
  const from = dateColumn(week.monday);
  const [settings, templates, instances, rows, rest, marker] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } }),
    prisma.taskTemplate.findMany({
      where: { userId, ...DUTY_TEMPLATES },
      select: {
        id: true,
        title: true,
        kind: true,
        recurrence: true,
        startDay: true,
        dueDay: true,
        dueKind: true,
        compulsory: true,
        compulsoryOnRest: true,
        inbox: true,
        archivedAt: true,
        pendingChange: true,
      },
    }),
    prisma.taskInstance.findMany({
      where: { userId, day: { gte: from, lte: dateColumn(addDays(week.sunday, 2)) }, template: DUTY_TEMPLATES },
      select: { templateId: true, day: true, slot: true, status: true, repaired: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, day: { gte: from, lte: dateColumn(week.sunday) } },
      select: { day: true, source: true, sink: true, track: true, xp: true, countsForStreak: true },
    }),
    // RestDay ships with Duty's migration; a read that fails (even synchronously, on a client generated
    // before it) leaves the week without held days rather than failing the page.
    Promise.resolve()
      .then(() =>
        prisma.restDay.findMany({
          where: { userId, day: { gte: from, lte: dateColumn(addDays(week.sunday, 7)) } },
          select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
        })
      )
      .catch(() => []),
    prisma.activityEvent.findUnique({ where: { userId_dedupeKey: { userId, dedupeKey: weekReviewKey(week.weekKey) } }, select: { id: true } }),
  ]);
  return {
    epochDay: settings ? keyOfDateColumn(settings.epochDay) : null,
    cursor: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    templates: templates.map((t) => ({
      id: t.id,
      title: t.title,
      kind: t.kind,
      recurrence: t.recurrence,
      startDay: keyOfDateColumn(t.startDay),
      dueDay: t.dueDay ? keyOfDateColumn(t.dueDay) : null,
      dueKind: t.dueKind,
      compulsory: t.compulsory,
      compulsoryOnRest: t.compulsoryOnRest,
      inbox: t.inbox,
      archivedDay: t.archivedAt ? dayKeyOf(t.archivedAt) : null,
      pendingChange: t.pendingChange,
    })),
    instances: instances.map((i) => ({ templateId: i.templateId, day: keyOfDateColumn(i.day), slot: i.slot, status: i.status, repaired: i.repaired })),
    rows: rows.map((r) => ({ day: keyOfDateColumn(r.day), source: r.source, sink: r.sink, track: r.track, xp: r.xp, countsForStreak: r.countsForStreak })),
    restRows: rest.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt })),
    marked: marker !== null,
  };
}

/** The done marker alone (the page outside the runner). False when the read fails: the review is then simply offered. */
async function readMarked(userId: string, week: ReviewedWeek): Promise<boolean> {
  try {
    const marker = await prisma.activityEvent.findUnique({
      where: { userId_dedupeKey: { userId, dedupeKey: weekReviewKey(week.weekKey) } },
      select: { id: true },
    });
    return marker !== null;
  } catch {
    return false;
  }
}

/**
 * Step 1: the reviewed week as far as it is settled, never a verdict; then
 * the last judged week. Before Duty (facts null) nothing is settled, so it
 * states no figure of its own: each daily quest's streak (named as Today
 * names the musts while Duty is off) and the last judged week.
 * With or without Duty, the reviewed week's audit (blueprint P11) when it is
 * open: a count of the daily quests, never a verdict.
 */
function StepOne({
  week: w,
  facts,
  duties,
  lastWeek,
  noneJudged,
  audit,
  today,
  live,
}: {
  week: ReviewedWeek;
  facts: WeekFacts | null;
  duties: { id: string; title: string; line: string }[];
  lastWeek: LastWeek | null;
  /** The ledger was read and holds no judged week (not merely unread). */
  noneJudged: boolean;
  /** The reviewed week's audit, or null (not launched, not open yet, another week's). */
  audit: WeekAudit | null;
  today: DayKey;
  /** Duty is live: the musts are its duties; before it they are the daily quests (D14). */
  live: boolean;
}) {
  const auditCard = audit && audit.weekKey === w.weekKey ? <WeekAuditCard audit={audit} today={today} headingId="wa-run-h" /> : null;
  if (!facts) {
    return (
      <>
        <p className="t-eyebrow">The week of {dayMonthLabel(w.monday)}</p>
        <h1>Look back at the week.</h1>
        {noneJudged && <p className="t-meta">No week has been judged yet.</p>}
        {auditCard}
        <DutyStandings duties={duties} live={live} />
        {lastWeek && <LastWeekCard week={lastWeek} today={today} />}
      </>
    );
  }
  const head =
    facts.through == null
      ? facts.label === "before Duty started"
        ? `The week of ${dayMonthLabel(w.monday)} was before Duty started.`
        : `Nothing in the week of ${dayMonthLabel(w.monday)} is settled yet.`
      : `You showed up ${facts.shownUp} of ${facts.days} settled ${facts.days === 1 ? "day" : "days"}.`;
  return (
    <>
      <p className="t-eyebrow">
        The week of {dayMonthLabel(w.monday)} · {facts.label}
      </p>
      <h1>{head}</h1>
      {facts.through != null ? (
        <div className="card">
          <ul className="lw-rows">
            <li className="lw-row">
              <Sigil track="duty" />
              <div className="lw-body">
                <b>Musts</b>
                <span className="t-meta lw-line">{mustTallyLine(facts.musts)}</span>
              </div>
            </li>
            <li className="lw-row">
              <Sigil track="duty" />
              <div className="lw-body">
                <b>Days</b>
                <span className="t-meta lw-line">
                  {facts.shownUp} shown up · {facts.held} held · {facts.freezesUsed} {facts.freezesUsed === 1 ? "freeze" : "freezes"} used
                </span>
              </div>
            </li>
            <li className="lw-row">
              <Sigil track="duty" />
              <div className="lw-body">
                <b>Duty XP</b>
                <span className="t-meta lw-line">{dutyXpLine(facts)}</span>
              </div>
            </li>
          </ul>
        </div>
      ) : (
        <p className="t-meta">
          {facts.label === "before Duty started"
            ? "Its days were lived before musts carried stakes, so nothing in it was settled."
            : `Each day settles at 04:00 two days after it; the first of this week settles ${weekdayLong(addDays(facts.from, 2))}.`}
        </p>
      )}
      {facts.through != null && !facts.complete && (
        <p className="t-meta">The rest of the week settles day by day; nothing about it is stated until then. The week is judged {weekdayLong(w.judgeDay)}.</p>
      )}
      {auditCard}
      <DutyStandings duties={duties} live={live} />
      {lastWeek && <LastWeekCard week={lastWeek} today={today} />}
    </>
  );
}

/**
 * Each must's streak and rung as of today (the board's own stats), with or without Duty: Duty's duties once it is
 * live, the daily quests before it (D14: Today's own name for the musts while Duty is off).
 */
function DutyStandings({ duties, live }: { duties: { id: string; title: string; line: string }[]; live: boolean }) {
  if (duties.length === 0) return null;
  return (
    <section aria-label={live ? "Each duty's streak" : "Each daily quest's streak"}>
      <p className="t-eyebrow">{live ? "Each duty, as of today" : "Each daily quest, as of today"}</p>
      <div className="card">
        <ul className="lw-rows">
          {duties.map((d) => (
            <li key={d.id} className="lw-row">
              <Sigil track="duty" />
              <div className="lw-body">
                <b>{d.title}</b>
                <span className="t-meta lw-line">{d.line}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** The week card's figures, from the judge's rows and mints for that week (kept tracks, then full days). */
function weekCardOf(ledger: LifeLedger, week: ReviewedWeek): WeekCardData | null {
  const lw = lastWeekOf(ledger, week.weekKey);
  if (!lw) return null;
  const days = new Set<string>();
  for (let d = week.monday; d <= week.sunday; d = addDays(d, 1)) days.add(fullDayMintKey(d));
  const fullDays = ledger.mints.filter((m) => days.has(m.key) && m.qty > 0);
  const fullMp = fullDays.reduce((s, m) => s + m.qty, 0);
  const trackMp = lw.rows.reduce((s, r) => s + (r.mp ?? 0), 0);
  const duty = lw.rows.find((r) => r.track === "DUTY");
  // The week's own model (momentum.md §A.10): today's amounts for a week before momentum's launch, 18 per kept track from it.
  const parts = [`${mpFigure(lifeMpModelOfWeek(week.monday).mp.WEEK_KEPT)} per kept track`];
  if (fullDays.length > 0) parts.push(`+${mpFigure(fullMp)} MP from ${fullDays.length} full ${fullDays.length === 1 ? "day" : "days"}`);
  if (duty) parts.push(`Duty's kept-week streak is ${duty.streak}`);
  return {
    eyebrow: `Week of ${dayMonthLabel(week.monday)} · judged ${weekdayLong(week.judgeDay)}`,
    kept: lw.rows.filter((r) => r.kept).length,
    total: lw.rows.length,
    tracks: lw.rows.map((r) => ({ track: TRACK_SIGIL[r.track], name: TRACK_NAME[r.track], kept: r.kept, held: r.held })),
    mp: trackMp + fullMp,
    line: `${parts.join(" · ")}.`,
  };
}

/**
 * The review's card on the page: offered, done, or when it opens next. It names only the steps that run: before Duty
 * no Owed, and the Sprint only when the main quest's sprint has something to show (the same `sprint` as StepsList).
 */
function ReviewCard({ week, marked, dutyLive, sprint }: { week: ReviewedWeek | null; marked: boolean; dutyLive: boolean; sprint: boolean }) {
  const title = !week ? "The next review opens Saturday" : marked ? `The week of ${dayMonthLabel(week.monday)} is reviewed` : `Review the week of ${dayMonthLabel(week.monday)}`;
  const parts = dutyLive
    ? ["the week as far as it is settled", "the inbox to zero", "a goals check-in", "anything owed", "the shape of next week"]
    : ["the last judged week", "the inbox to zero", "a goals check-in", "your daily capacity"];
  if (sprint) parts.push("your main quest's sprint");
  const count = STEP_COUNT[reviewPlanOf(dutyLive, sprint).steps.length];
  const line = !week
    ? "On Saturday and Sunday it covers the week as it ends; from Monday to Wednesday it catches up on the week just ended."
    : marked
      ? "Open it again any time until Thursday; nothing in it is written twice."
      : `${count} short steps, each skippable: ${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}.`;
  return (
    <section className="card pad-l" aria-labelledby="week-h">
      <p className="t-eyebrow">Weekly review · Saturday to Wednesday</p>
      <h2 id="week-h" className="t-display-m" style={{ marginTop: 6 }}>
        {title}
      </h2>
      <p className="t-meta" style={{ marginTop: 8 }}>
        {line}
      </p>
      <div className="lw-actions">
        {week && (
          <Button variant={marked ? "secondary" : "primary"} href="/today/week?view=run">
            {marked ? "Open the review" : "Start the review"}
          </Button>
        )}
        <Button variant={week ? "quiet" : "secondary"} href="/today" icon="today">
          Back to Today
        </Button>
        <Button variant="quiet" href="/today/rules">
          How weeks are judged
        </Button>
      </div>
    </section>
  );
}

export default async function WeekPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = getCurrentUserId();
  const now = new Date();
  // Life's one maintenance chain, after the response (idempotent, single flight): settle any day
  // that is due, then judge the closed weeks. It writes only on a server allowed to write. A newly
  // judged week shows here, with its Seal, on the next load.
  after(async () => {
    await maybeMaintainLife(userId);
  });
  const life = await loadLifeTracks(userId).catch(() => notLaunchedView(todayKey(now)));
  const ledger = life.launched ? await loadLifeLedger(userId).catch(() => null) : null;
  const week = ledger && life.lastJudgedWeek ? lastWeekOf(ledger, life.lastJudgedWeek) : null;
  const today = life.today;
  const launchDay = dutyLaunchDay();
  const dutyLive = isDutyLaunched(today, launchDay);
  // The review runs with or without Duty (decision D13); Duty's own parts only once it is live.
  const review = reviewedWeek(today);
  const plan = reviewPlanOf(dutyLive);
  // The week audit (blueprint P11): null until AUDIT_LAUNCH_DAY; a failed read leaves the card out, never the page.
  const auditRead = loadWeekAudit(userId, now).catch((err: unknown): WeekAudit | null => {
    console.error("Weekly review: the week audit failed to load.", err);
    return null;
  });
  // The main quest (P15): its Aim card and its own sprint this week (cached reads), then, for a goal that may have run
  // one, its past sprints; the Sprint step only when it has something to show (sprintStepOf), for the run and for the
  // page's step list and card alike. Thursday and Friday the next review covers this week. A failure reads as none.
  const sprintRead: Promise<SprintStep | null> = (async () => {
    const card = await loadMainQuestCard(userId, now).catch(() => null);
    const quest = mainQuestOf(card, await loadMainQuestWeek(userId, now, card).catch(() => null), today);
    const past = readsPastSprints(quest) ? await loadPastWeeks(userId, quest.roadmapId, today).catch(() => []) : [];
    return sprintStepOf(quest, review?.monday ?? weekStartKeyOf(today), today, past);
  })();

  if (review && (await searchParams).view === "run") {
    // Before Duty nothing is settled: the run reads only its done marker (the rest of readReview is Duty's facts).
    const [read, markedBefore, data, audit, sprint, calibrated] = await Promise.all([
      plan.settledFacts ? readReview(userId, review) : null,
      plan.settledFacts ? false : readMarked(userId, review),
      loadTodayBoard(userId, today, now),
      auditRead,
      sprintRead,
      loadNextWeek(userId, now).catch((err: unknown) => {
        console.error("Weekly review: next week's calibration failed to load.", err);
        return null;
      }),
    ]);
    // P32: only the calibration for the week after the reviewed one (on Saturday and Sunday it is not set yet).
    const nextWeek = calibrated && calibrated.monday === addDays(review.monday, 7) ? calibrated : null;
    const facts = read
      ? weekFactsOf({
          week: review,
          cursor: read.cursor,
          firstDutyDay: read.epochDay ? firstDutyDay(read.epochDay, launchDay) : null,
          templates: read.templates,
          instances: read.instances,
          rows: read.rows,
          restRows: read.restRows,
        })
      : null;
    const duties = data.templates
      .filter((t) => t.compulsory && ruleOf(t) && data.stats[t.id])
      .map((t) => ({ id: t.id, title: t.title, line: dutyStandingOf({ streak: data.stats[t.id].streak.before, strength: data.stats[t.id].strength.before }) }));
    let rest: RestDayOption[] = [];
    let restNote: string | null = null;
    if (read && plan.restDays) {
      const declared = validRestDays(read.restRows, review.monday, addDays(review.sunday, 7));
      const restDays = nextWeekDays(review, today, launchDay);
      rest = restDays.map((day) => {
        const kind = declared.get(day) ?? null;
        return { day, label: weekdayDateLabel(day), declared: kind, refusal: kind ? null : restRefusalOf(day, declared) };
      });
      restNote = restDays.length === 0 ? "No day of the coming week can be declared from here; rest is declared before its day starts." : null;
    }
    // The week card only once the judge has written every track of the reviewed week; never a provisional verdict.
    const card = ledger && life.judgedWeeks.includes(review.weekKey) ? weekCardOf(ledger, review) : null;
    return (
      <div className="page narrow today-week">
        <WeekReview
          weekKey={review.weekKey}
          weekLabel={`week of ${dayMonthLabel(review.monday)}`}
          today={today}
          data={data}
          launched={isLaunched(today)}
          dutyLive={dutyLive}
          stepOne={<StepOne week={review} facts={facts} duties={duties} lastWeek={week} noneJudged={ledger != null && week == null} audit={audit} today={today} live={dutyLive} />}
          rest={rest}
          restNote={restNote}
          end={card ? { kind: "card", card } : { kind: "pending", text: isLaunched(today) ? reviewPendingText(review) : REVIEW_BEFORE_LIFE_TEXT }}
          marked={read ? read.marked : markedBefore}
          sprint={sprint}
          nextWeek={nextWeek}
        />
      </div>
    );
  }

  // Defer and abort (task-decisions.ts): this week's decisions, Monday to today, with their reasons.
  const decisionsFrom = weekStartKeyOf(today);
  const [marked, decisionRows, audit, sprint] = await Promise.all([review ? readMarked(userId, review) : Promise.resolve(false), readWeekDecisions(userId, decisionsFrom, today), auditRead, sprintRead]);
  const decisions = weekDecisionsViewOf(decisionRows, now);

  return (
    <div className="page narrow today-week">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {life.launched && ledger && (week ? <LastWeekCard week={week} today={life.today} /> : <FirstWeekCard epochDay={ledger.epochDay} today={life.today} />)}
        {audit && <WeekAuditCard audit={audit} today={today} />}
        <ReviewCard week={review} marked={marked} dutyLive={dutyLive} sprint={sprint != null} />
        <WeekDecisions view={decisions} weekLabel={`Week of ${dayMonthLabel(decisionsFrom)}`} />
        <StepsList live={dutyLive} sprint={sprint != null} />
      </div>
    </div>
  );
}
