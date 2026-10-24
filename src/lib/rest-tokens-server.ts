/**
 * The Rest Token bank's read (blueprint P21; decision D19), for every reader outside momentum-server: settlement's
 * step 3 (through its own client, so the checks' stub answers it), the Today board's Duty part, the daily streak,
 * 'Use a freeze' and the launch script's dry run. Server only. The fold itself is rest-tokens.ts; momentum-server
 * folds the same sources from its store (readRunRows), so both read one bank.
 *
 *   readRestTokens(client, userId, through, opts?)        → RestTokenInputs | null (null: the bank is not live)
 *   readRestTokenSummary(client, userId, today, opts?)    → RestTokenSummary | null
 *
 * The rows: net momentum units by day (momentum-server's units query, verbatim), the CHEST, PERK, RESPEC and
 * FREEZE_USE rows and the kept Body weeks from MOMENTUM_LAUNCH_DAY through `through`, and, once a Duty launch day is
 * set, the RestDay rows from it (duty-rule heldDaysOf decides which hold). A FREEZE_USE row counts from that same day
 * only (rest-tokens restTokenSpendFrom, P21 review): with Duty off none does. Nothing is written.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { dateColumn, keyOfDateColumn, type DayKey } from "./life-day";
import { dutyLaunchDay } from "./duty-economy";
import { heldDaysOf } from "./duty-rule";
import { momentumLaunchDay } from "./momentum";
import { isMissingRestDayTable } from "./rest-rules";
import { restTokenInputsOf, restTokenSpendFrom, restTokenSummaryOf, type RestTokenInputs, type RestTokenSummary } from "./rest-tokens";

/** The Prisma surface the read uses: the real client, or settle-check's recording stub. */
export type RestTokenClient = Pick<PrismaClient, "$queryRaw" | "activityEvent" | "restDay">;

/** The ledger sources the bank folds besides the units: chests, perks and respecs, and the spends. */
export const REST_TOKEN_SOURCES = ["CHEST", "PERK", "RESPEC", "FREEZE_USE"] as const;
/** A kept Body week's WEEK row (Recovery adds a token on its Sunday). */
export const BODY_WEEK_KEY_PREFIX = "week:BODY:";

export interface RestTokenReadOptions {
  /** MOMENTUM_LAUNCH_DAY in force (default momentumLaunchDay()); null: no bank. */
  launch?: DayKey | null;
  /** DUTY_LAUNCH_DAY in force (default dutyLaunchDay()): rest days hold from it; null reads none. */
  dutyLaunch?: DayKey | null;
}

/** The bank's inputs from MOMENTUM_LAUNCH_DAY through `through`; null before it (or with no launch day). */
export async function readRestTokens(client: RestTokenClient, userId: string, through: DayKey, opts: RestTokenReadOptions = {}): Promise<RestTokenInputs | null> {
  const launch = opts.launch === undefined ? momentumLaunchDay() : opts.launch;
  if (launch == null || through < launch) return null;
  const duty = opts.dutyLaunch === undefined ? dutyLaunchDay() : opts.dutyLaunch;
  // Rest days and the spends both count from the Duty launch day (none while Duty is off).
  const restFrom = restTokenSpendFrom(launch, duty);
  const [units, rows, rest] = await Promise.all([
    client.$queryRaw<{ day: Date; units: number }[]>(Prisma.sql`
      SELECT "day",
             COALESCE(SUM(CASE WHEN "countsForStreak" AND "source" IN ('TASK', 'WORKOUT', 'CHECKPOINT') THEN 1 WHEN "source" = 'UNDO' THEN -1 ELSE 0 END), 0)::int AS "units"
      FROM "ActivityEvent"
      WHERE "userId" = ${userId} AND "day" >= ${launch}::date AND "day" <= ${through}::date AND "source" IN ('TASK', 'WORKOUT', 'CHECKPOINT', 'UNDO')
      GROUP BY "day"
    `),
    client.activityEvent.findMany({
      where: {
        userId,
        day: { gte: dateColumn(launch), lte: dateColumn(through) },
        OR: [{ source: { in: [...REST_TOKEN_SOURCES] } }, { source: "WEEK", dedupeKey: { startsWith: BODY_WEEK_KEY_PREFIX } }],
      },
      select: { day: true, source: true, receipt: true, detail: true, occurredAt: true, qty: true },
    }),
    restFrom != null && restFrom <= through
      ? client.restDay
          .findMany({ where: { userId, day: { gte: dateColumn(restFrom), lte: dateColumn(through) } }, select: { day: true, kind: true, declaredAt: true, cancelledAt: true } })
          .catch((err: unknown) => {
            // A Duty launch day set before life_duty is applied reads no rest, as the board does.
            if (!isMissingRestDayTable(err)) throw err;
            return [] as { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[];
          })
      : Promise.resolve([] as { day: Date; kind: string; declaredAt: Date; cancelledAt: Date | null }[]),
  ]);
  const dayOf = (d: Date) => keyOfDateColumn(new Date(d));
  const events = rows.map((r) => ({ ...r, day: dayOf(r.day) }));
  return restTokenInputsOf({
    launch,
    through,
    units: new Map(units.map((u) => [dayOf(u.day), Number(u.units) || 0])),
    chests: events.filter((r) => r.source === "CHEST"),
    perkRows: events.filter((r) => r.source === "PERK" || r.source === "RESPEC").map((r) => ({ source: r.source, detail: r.detail, occurredAt: new Date(r.occurredAt) })),
    bodyKept: new Set(events.filter((r) => r.source === "WEEK" && (r.qty ?? 0) > 0).map((r) => r.day)),
    spent: restFrom == null ? [] : events.filter((r) => r.source === "FREEZE_USE" && r.day >= restFrom).map((r) => r.day),
    rest:
      restFrom == null
        ? []
        : heldDaysOf(
            rest.map((r) => ({ day: dayOf(r.day), kind: r.kind, declaredAt: new Date(r.declaredAt), cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null })),
            restFrom,
            through
          ),
  });
}

/** The bank as a page shows it today (the chip, the board, the phone); null when it is not live. */
export async function readRestTokenSummary(client: RestTokenClient, userId: string, today: DayKey, opts: RestTokenReadOptions = {}): Promise<RestTokenSummary | null> {
  const t = await readRestTokens(client, userId, today, opts);
  return t ? restTokenSummaryOf(t, today) : null;
}
