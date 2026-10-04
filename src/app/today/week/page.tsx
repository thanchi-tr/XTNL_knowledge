import "../rules/rules.css";
import type { Metadata } from "next";
import { after } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUserId } from "@/lib/user";
import { prisma } from "@/lib/prisma";
import { addDays, dateColumn, dayKeyOf, keyOfDateColumn, todayKey, type DayKey } from "@/lib/life-day";
import { LIFE_MP, LIFE_MP_WEEK_CAP, isBackfillDetail, isLaunched, lifeWritesEnabled, weekKeptMintKey, withoutBackfill } from "@/lib/life-economy";
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
  dayMonthLabel,
  dutyStandingOf,
  dutyXpLine,
  mustTallyLine,
  nextWeekDays,
  restRefusalOf,
  reviewPendingText,
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
import { firstWeekJudgement, longDayLabel, mpFigure, pendingWeek, weekReviewPromise, weekdayDayLabel } from "@/components/home/sheet-math";
import { WeekReview, type RestDayOption, type WeekCardData } from "@/components/home/WeekReview";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
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
 * Until Duty's launch day the review is a placeholder: nothing is settled,
 * and a review with made-up figures would be a dishonest number. From it,
 * the review of rituals.ts reviewedWeek(today) (Saturday to Wednesday) runs
 * at ?view=run (components/home/WeekReview.tsx): its first step states the
 * week only as far as settlement has judged it, and it ends on the week
 * card only once the judge has written that week. Finishing writes the
 * week's done marker ('week-review:<YYYY-Www>').
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
    <section aria-labelledby="lw-h">
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
            : `Life MP for that week: ${mpFigure(week.used)} of ${mpFigure(LIFE_MP_WEEK_CAP)}`}
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

/** The five steps, as the page lists them before the review starts (before Duty is live, as they were promised). */
function StepsList({ live }: { live: boolean }) {
  const steps = live
    ? [
        ["The week", "Days shown up, musts kept, freezes used and Duty XP, as far as each day is settled; the last judged week."],
        ["Inbox", "Sort what is left to zero, one tap each."],
        ["Goals", "Check in on each open goal."],
        ["Owed", "Make up, or leave it: it never grows."],
        ["Next week", "Rest days and daily capacity."],
      ]
    : [
        ["Last week", "Kept or not per track, with the reason; days shown up; freezes used."],
        ["Inbox", "Sort what is left to zero, one tap each."],
        ["Goals", "Check in on anything that has stalled."],
        ["Owed", "Make up, or leave it: it never grows."],
        ["Next week", "Rest days and daily capacity."],
      ];
  return (
    <section aria-labelledby="week-steps">
      <SectionHeader id="week-steps" title="Five steps, each skippable" />
      <ol className="card" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map(([k, v]) => (
          <li key={k} className="collapsed" style={{ alignItems: "flex-start", padding: "12px 14px" }}>
            <b className="ink-0" style={{ flex: "0 0 96px" }}>
              {k}
            </b>
            <span>{v}</span>
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

/** Step 1: the reviewed week as far as it is settled, never a verdict; then the last judged week. */
function StepOne({ facts, duties, lastWeek, today }: { facts: WeekFacts; duties: { id: string; title: string; line: string }[]; lastWeek: LastWeek | null; today: DayKey }) {
  const w = facts.week;
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
      {duties.length > 0 && (
        <section aria-label="Each duty's streak">
          <p className="t-eyebrow">Each duty, as of today</p>
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
      )}
      {lastWeek && <LastWeekCard week={lastWeek} today={today} />}
    </>
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
  const parts = [`${mpFigure(LIFE_MP.WEEK_KEPT)} per kept track`];
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

/** The review's card on the page: offered, done, or when it opens next. */
function ReviewCard({ week, marked }: { week: ReviewedWeek | null; marked: boolean }) {
  const title = !week ? "The next review opens Saturday" : marked ? `The week of ${dayMonthLabel(week.monday)} is reviewed` : `Review the week of ${dayMonthLabel(week.monday)}`;
  const line = !week
    ? "On Saturday and Sunday it covers the week as it ends; from Monday to Wednesday it catches up on the week just ended."
    : marked
      ? "Open it again any time until Thursday; nothing in it is written twice."
      : "Five short steps, each skippable: the week as far as it is settled, the inbox to zero, a goals check-in, anything owed, and the shape of next week.";
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
  const review = dutyLive ? reviewedWeek(today) : null;

  if (dutyLive && review && (await searchParams).view === "run") {
    const [read, data] = await Promise.all([readReview(userId, review), loadTodayBoard(userId, today, now)]);
    const facts = weekFactsOf({
      week: review,
      cursor: read.cursor,
      firstDutyDay: read.epochDay ? firstDutyDay(read.epochDay, launchDay) : null,
      templates: read.templates,
      instances: read.instances,
      rows: read.rows,
      restRows: read.restRows,
    });
    const duties = data.templates
      .filter((t) => t.compulsory && ruleOf(t) && data.stats[t.id])
      .map((t) => ({ id: t.id, title: t.title, line: dutyStandingOf({ streak: data.stats[t.id].streak.before, strength: data.stats[t.id].strength.before }) }));
    const declared = validRestDays(read.restRows, review.monday, addDays(review.sunday, 7));
    const restDays = nextWeekDays(review, today, launchDay);
    const rest: RestDayOption[] = restDays.map((day) => {
      const kind = declared.get(day) ?? null;
      return { day, label: weekdayDateLabel(day), declared: kind, refusal: kind ? null : restRefusalOf(day, declared) };
    });
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
          stepOne={<StepOne facts={facts} duties={duties} lastWeek={week} today={today} />}
          rest={rest}
          restNote={restDays.length === 0 ? "No day of the coming week can be declared from here; rest is declared before its day starts." : null}
          end={card ? { kind: "card", card } : { kind: "pending", text: reviewPendingText(review) }}
          marked={read.marked}
        />
      </div>
    );
  }

  const marked = review ? await readMarked(userId, review) : false;

  return (
    <div className="page narrow today-week">
      <div style={{ paddingTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        {life.launched && ledger && (week ? <LastWeekCard week={week} today={life.today} /> : <FirstWeekCard epochDay={ledger.epochDay} today={life.today} />)}
        {dutyLive ? (
          <ReviewCard week={review} marked={marked} />
        ) : (
          <section className="card pad-l" aria-labelledby="week-h">
            <p className="t-eyebrow">Weekly review · arrives with daily settlement</p>
            <h2 id="week-h" className="t-display-m" style={{ marginTop: 6 }}>
              A short review of the week that ended
            </h2>
            <p className="t-meta" style={{ marginTop: 8 }}>
              {weekReviewPromise(life.launched)}
            </p>
            <p className="t-meta" style={{ marginTop: 8 }}>
              Until then, every tick on Today is already counted, and nothing is lost.
            </p>
            <div className="lw-actions">
              <Button variant="secondary" href="/today" icon="today">
                Back to Today
              </Button>
              {life.launched && (
                <Button variant="quiet" href="/today/rules">
                  How weeks are judged
                </Button>
              )}
            </div>
          </section>
        )}
        <StepsList live={dutyLive} />
      </div>
    </div>
  );
}
