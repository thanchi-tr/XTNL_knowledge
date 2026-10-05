/**
 * Throughput's reads (roadmap lane R2, F3): one Promise.all of narrow,
 * mostly aggregated queries over the 8 life weeks up to finalDay, cached as
 * 'throughput:<user>:<finalDay>' on ['life', 'activity', 'fields'].
 * Server-only; read-only (writes nothing). The arithmetic is throughput.ts's.
 *
 * Contract: docs/life-plan/roadmap-contracts.md §R2. Callers: R4 (the intake
 * view, drafting, Start), R6 (a week's capacity, read as if on Monday:
 * finalDay = weekStart − THROUGHPUT_LAG_DAYS).
 *
 * "As of". The read is as of today's 04:00, where today = finalDay +
 * THROUGHPUT_LAG_DAYS: rows written after that instant (a late make-up, a
 * rest day declared later) are left out, so a past Monday's read gives the
 * same figures whenever it runs. Instances are read up to today (outcomesOf
 * needs today for its pending rule) and only days ≤ finalDay are judged.
 *
 *   loadThroughput · loadThroughputRows
 */
import { prisma } from "./prisma";
import { cached } from "./cache";
import { DAY_START_HOUR, LIFE_TZ, addDays, dateColumn, dayKeyOf, dayStartOf, keyOfDateColumn, type DayKey } from "./life-day";
import { heldDaysOf, type RestRow } from "./duty-rule";
import { ADHERENCE_MIN_MINUTES, CLEARANCE_WINDOW_DAYS, NEW_CARDS_SINCE, PASS_SHARE_WINDOW_DAYS, REVIEW_PASSES_SINCE, THROUGHPUT_LAG_DAYS, type Throughput } from "./roadmap-types";
import { clearanceSeriesStart, taskRowsOf, throughputOf, throughputWindowStart, type ThroughputLedgerRow, type ThroughputRows } from "./throughput";

// Timestamp columns are TIMESTAMP(3) holding UTC wall time; the raw query compares them with
// the instant converted to UTC explicitly, so the session's TimeZone setting never shifts it.

interface LedgerRowRaw {
  id: string;
  source: string;
  dedupeKey: string | null;
  day: Date;
  track: string | null;
  minutes: number | null;
  autoMetric: string | null;
  intrinsic: boolean | null;
  category: string | null;
  minutesSource: string | null;
  reported: number | null;
}

interface DayCountRaw {
  day: Date;
  n: number;
}

const maxDay = (a: DayKey, b: DayKey): DayKey => (a > b ? a : b);
const minDay = (a: DayKey, b: DayKey): DayKey => (a < b ? a : b);

/** Bands adherence reads (≥ STANDARD); throughput.ts filters again, purely. */
const ADHERENCE_BANDS = ["STANDARD", "DEMANDING", "SEVERE"];

/**
 * The rows throughputOf reads, as of `finalDay` (today − THROUGHPUT_LAG_DAYS),
 * uncached. Nine reads in one wave: the settings, the TASK and UNDO rows
 * (joined to their template and instance), the live recurring STANDARD+
 * templates of ≥ 20 min with their instances, review attempts a day, the
 * REVIEW_FRACTION passes of the last 28 days, the DAY_OPEN rows, new cards,
 * the RestDay rows and the FREEZE_USE days.
 *
 * Revision 4 (F-R4-8): ρ's clearance series reads the last
 * CLEARANCE_SERIES_DAYS (90) life days, so the DAY_OPEN rows, the review
 * attempts and the held days are read from the earlier of the 8-week window
 * and that series. Every other figure filters to its own window (clearance
 * its 14 days, the weekly figures their counted weeks), so they are unchanged.
 */
async function readThroughputRows(userId: string, finalDay: DayKey): Promise<ThroughputRows> {
  const today = addDays(finalDay, THROUGHPUT_LAG_DAYS);
  const asOf = dayStartOf(today);
  const from = throughputWindowStart(finalDay);
  const passFrom = maxDay(addDays(finalDay, -(PASS_SHARE_WINDOW_DAYS - 1)), REVIEW_PASSES_SINCE);
  const seriesFrom = clearanceSeriesStart(finalDay);
  const openFrom = minDay(addDays(finalDay, -(CLEARANCE_WINDOW_DAYS - 1)), seriesFrom);
  const readFrom = minDay(from, seriesFrom);
  const cardsFrom = maxDay(from, NEW_CARDS_SINCE);

  const [settings, ledger, recurring, attempts, passes, dayOpens, ideas, restRows, freezeRows] = await Promise.all([
    prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } }),
    prisma.$queryRaw<LedgerRowRaw[]>`
      SELECT e."id", e."source", e."dedupeKey", e."day", e."track",
             CASE WHEN jsonb_typeof(e."receipt"::jsonb -> 'minutes') = 'number' THEN (e."receipt"::jsonb ->> 'minutes')::float8 END AS "minutes",
             t."autoMetric", t."intrinsic", t."category", t."minutesSource",
             i."minutes" AS "reported"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      LEFT JOIN "TaskInstance" i ON i."id" = e."sourceId"
      WHERE e."userId" = ${userId} AND e."source" IN ('TASK', 'UNDO')
        AND e."day" >= ${from}::date AND e."day" <= ${finalDay}::date
        AND e."createdAt" < (${asOf.toISOString()}::timestamptz AT TIME ZONE 'UTC')
    `,
    prisma.taskTemplate.findMany({
      where: {
        userId,
        archivedAt: null,
        recurrence: { not: null },
        kind: { in: ["TASK", "HABIT"] },
        band: { in: ADHERENCE_BANDS },
        estMinutes: { gte: ADHERENCE_MIN_MINUTES },
        startDay: { lte: dateColumn(finalDay) },
      },
      select: {
        id: true,
        recurrence: true,
        startDay: true,
        band: true,
        estMinutes: true,
        instances: {
          where: { day: { gte: dateColumn(from), lte: dateColumn(today) } },
          select: { day: true, status: true, repaired: true },
        },
      },
    }),
    prisma.$queryRaw<DayCountRaw[]>`
      SELECT e."day", COUNT(*)::int AS "n"
      FROM "ActivityEvent" e
      WHERE e."userId" = ${userId} AND e."source" = 'REVIEW' AND COALESCE(e."dedupeKey", '') NOT LIKE 'bf:%'
        AND e."day" >= ${readFrom}::date AND e."day" <= ${finalDay}::date
      GROUP BY e."day"
    `,
    // Passes: the REVIEW_FRACTION ledger rows per life day. createdAt holds UTC wall time: read
    // as UTC, shown in the life zone, less the day-start hour, it falls on its life day.
    prisma.$queryRaw<DayCountRaw[]>`
      SELECT ((l."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${LIFE_TZ} - make_interval(hours => ${DAY_START_HOUR}::int))::date AS "day",
             COUNT(*)::int AS "n"
      FROM "MasteryLedgerEntry" l
      WHERE l."userId" = ${userId} AND l."reason" = 'REVIEW_FRACTION'
        AND l."createdAt" >= (${dayStartOf(passFrom).toISOString()}::timestamptz AT TIME ZONE 'UTC')
        AND l."createdAt" < (${dayStartOf(addDays(finalDay, 1)).toISOString()}::timestamptz AT TIME ZONE 'UTC')
      GROUP BY 1
    `,
    prisma.activityEvent.findMany({
      where: { userId, source: "DAY_OPEN", day: { gte: dateColumn(openFrom), lte: dateColumn(finalDay) } },
      select: { day: true, qty: true },
    }),
    prisma.idea.findMany({
      where: { isArchived: false, createdAt: { gte: dayStartOf(cardsFrom), lt: dayStartOf(addDays(finalDay, 1)) } },
      select: { createdAt: true, domainId: true, domain: { select: { fieldId: true } } },
    }),
    prisma.restDay.findMany({
      where: { userId, day: { gte: dateColumn(readFrom), lte: dateColumn(finalDay) }, declaredAt: { lt: asOf } },
      select: { day: true, kind: true, declaredAt: true, cancelledAt: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "FREEZE_USE", day: { gte: dateColumn(readFrom), lte: dateColumn(finalDay) }, createdAt: { lt: asOf } },
      select: { day: true },
    }),
  ]);

  const rest: RestRow[] = restRows.map((r) => ({ day: keyOfDateColumn(r.day), kind: r.kind, declaredAt: r.declaredAt, cancelledAt: r.cancelledAt }));
  const held = heldDaysOf(rest, readFrom, finalDay);
  for (const f of freezeRows) held.add(keyOfDateColumn(f.day));

  const ledgerRows: ThroughputLedgerRow[] = ledger
    .filter((r) => r.source === "TASK" || r.source === "UNDO")
    .map((r) => ({
      id: r.id,
      source: r.source as "TASK" | "UNDO",
      dedupeKey: r.dedupeKey,
      day: keyOfDateColumn(new Date(r.day)),
      track: r.track,
      minutes: r.minutes == null ? null : Number(r.minutes),
      autoMetric: r.autoMetric,
      intrinsic: r.intrinsic === true,
      category: r.category,
      minutesSource: r.minutesSource,
      reportedMinutes: r.reported == null ? null : Number(r.reported),
    }));

  const attemptsByDay = new Map<DayKey, number>();
  for (const a of attempts) attemptsByDay.set(keyOfDateColumn(new Date(a.day)), Number(a.n));
  const passesByDay = new Map<DayKey, number>();
  for (const p of passes) {
    const d = keyOfDateColumn(new Date(p.day));
    passesByDay.set(d, (passesByDay.get(d) ?? 0) + Number(p.n));
  }
  const reviewDays = [...new Set([...attemptsByDay.keys(), ...passesByDay.keys()])].sort();

  return {
    today,
    finalDay,
    epochDay: settings ? keyOfDateColumn(settings.epochDay) : null,
    settledThroughDay: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
    heldDays: [...held].sort(),
    tasks: taskRowsOf(ledgerRows),
    recurring: recurring
      .filter((t) => t.recurrence != null)
      .map((t) => ({
        id: t.id,
        rule: t.recurrence as string,
        startDay: keyOfDateColumn(t.startDay),
        band: t.band,
        estMinutes: t.estMinutes,
        instances: t.instances.map((i) => ({ day: keyOfDateColumn(i.day), status: i.status, repaired: i.repaired })),
      })),
    reviews: reviewDays.map((day) => ({ day, attempts: attemptsByDay.get(day) ?? 0, passes: passesByDay.get(day) ?? 0 })),
    dayOpens: dayOpens.map((r) => {
      const day = keyOfDateColumn(r.day);
      return { day, open: Math.max(0, Math.round(r.qty ?? 0)), reviews: attemptsByDay.get(day) ?? 0 };
    }),
    newCards: ideas.map((i) => ({ day: dayKeyOf(i.createdAt), fieldId: i.domain.fieldId, domainId: i.domainId })),
  };
}

/**
 * The rows throughputOf reads (cached), for callers that need more than the
 * figures: R4 reads a card scope's pace with throughput.ts scopePaceOf(rows, …).
 */
export function loadThroughputRows(userId: string, finalDay: DayKey): Promise<ThroughputRows> {
  return cached(`throughputRows:${userId}:${finalDay}`, ["life", "activity", "fields"], () => readThroughputRows(userId, finalDay));
}

/** Throughput as of `finalDay` (today − THROUGHPUT_LAG_DAYS, or a past Monday's). */
export async function loadThroughput(userId: string, finalDay: DayKey): Promise<Throughput> {
  return cached(`throughput:${userId}:${finalDay}`, ["life", "activity", "fields"], async () => throughputOf(await loadThroughputRows(userId, finalDay)));
}
