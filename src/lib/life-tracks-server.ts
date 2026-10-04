/**
 * FROZEN CONTRACT (M5 lane 0; lane A implements, F3) — the life ledger
 * loader and the one life-tracks view. Server only (it reads Prisma); with
 * life-weeks-server.ts's judge, the only reader of TRACK rows.
 *
 * Spec: docs/life-plan/m5-refit.md F3; contract table:
 * docs/life-plan/m5-contracts.md.
 *
 *   loadLifeLedger(userId)       cached('lifeLedger:' + userId, ['life']): five reads in one
 *                                Promise.all (TRACK xp by track and day; xp and composition by
 *                                compositionKey; WEEK rows; MP_MINT rows; LifeSettings.epochDay)
 *   loadLifeTracks(userId, now?) React cache() over it. Not launched (life-economy isLaunched)
 *                                or no epochDay: notLaunchedView(today). Otherwise the full view
 *                                from trackStateAt(ledger, today).
 *
 * Added by lane A (compatible):
 *   readLifeLedger(userId)       the same five reads, uncached and ungated: the launch script's
 *                                dry run reads the real ledger before the launch day.
 * Added by the M5 review (C3):
 *   lifeMintLockOp(userId)       the first op of every transaction that mints life MP (a goal
 *                                close, a judged week): a per-user advisory lock, released at
 *                                commit, so a guard after it reads every mint committed before
 *   isStaleGuard(err)            a guard op's deliberate division by zero (SQLSTATE 22012)
 * Added by M2 lane B (compatible, F11):
 *   The WEEK read also takes each row's receipt, so a held week (mark 'held') reads held
 *   through life-tracks.ts weekMarkOf; the LifeSettings read also takes settledThroughDay
 *   (LifeLedger.settledThroughDay) for the judge's cheap check. Still five reads, one round trip.
 *
 * Inert before launch: until isLaunched(today) holds, loadLifeLedger returns
 * the empty ledger without a query, so every caller (the attribute seam, the
 * progress rate, the You sheet's week-ago ghost, Stats) sees no life at all
 * and every page shows exactly today's numbers. A user with no LifeSettings
 * (no epochDay) reads the same way.
 */
import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { cached } from "./cache";
import { keyOfDateColumn, todayKey } from "./life-day";
import { isLaunched, parseMintDetail, parseWeekRowKey } from "./life-economy";
import { isTrack } from "./life-grade";
import {
  emptyLifeLedger,
  lifeTracksView,
  notLaunchedView,
  weekMarkOf,
  type LedgerComposition,
  type LedgerMint,
  type LedgerWeek,
  type LedgerXpDay,
  type LifeLedger,
  type LifeTracksView,
} from "./life-tracks";
import type { Composition } from "./life-types";

interface CompositionRow {
  track: string | null;
  key: string | null;
  xp: number | null;
  composition: string | null;
}

/** A template's stored composition, parsed: an object of attribute weights, or null. */
function parseComposition(text: string | null): Composition | null {
  if (!text) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Composition) : null;
  } catch {
    return null;
  }
}

/**
 * The five reads, one round trip. Only TRACK rows carry life XP (sink =
 * 'TRACK'); WEEK and MP_MINT rows are read by their source. Rows whose key or
 * track does not parse are skipped rather than guessed at.
 */
export async function readLifeLedger(userId: string): Promise<LifeLedger> {
  const [xpRows, compRows, weekRows, mintRows, settings] = await Promise.all([
    prisma.activityEvent.groupBy({
      by: ["track", "day"],
      where: { userId, sink: "TRACK", track: { not: null } },
      _sum: { xp: true },
    }),
    prisma.$queryRaw<CompositionRow[]>`
      SELECT e."track", e."compositionKey" AS "key",
             COALESCE(SUM(e."xp"), 0)::float8 AS "xp",
             MAX(t."composition"::text) AS "composition"
      FROM "ActivityEvent" e
      LEFT JOIN "TaskTemplate" t ON t."id" = e."templateId"
      WHERE e."userId" = ${userId} AND e."sink" = 'TRACK' AND e."track" IS NOT NULL
      GROUP BY e."track", e."compositionKey"
    `,
    prisma.activityEvent.findMany({
      where: { userId, source: "WEEK" },
      select: { track: true, dedupeKey: true, day: true, qty: true, detail: true, receipt: true },
    }),
    prisma.activityEvent.findMany({
      where: { userId, source: "MP_MINT" },
      select: { track: true, templateId: true, dedupeKey: true, day: true, qty: true, detail: true },
    }),
    prisma.lifeSettings.findUnique({ where: { userId }, select: { epochDay: true, settledThroughDay: true } }),
  ]);

  const xpByDay: LedgerXpDay[] = [];
  for (const r of xpRows) {
    if (!isTrack(r.track)) continue;
    xpByDay.push({ track: r.track, day: keyOfDateColumn(r.day), xp: r._sum.xp ?? 0 });
  }

  const compositions: LedgerComposition[] = [];
  for (const r of compRows) {
    if (!isTrack(r.track)) continue;
    compositions.push({ track: r.track, key: r.key, xp: Number(r.xp ?? 0), composition: parseComposition(r.composition) });
  }

  const weeks: LedgerWeek[] = [];
  for (const r of weekRows) {
    const parsed = parseWeekRowKey(r.dedupeKey);
    if (!parsed) continue;
    const mark = weekMarkOf({ qty: r.qty, receipt: r.receipt });
    weeks.push({
      track: parsed.track,
      weekKey: parsed.weekKey,
      sunday: keyOfDateColumn(r.day),
      kept: mark === "kept",
      detail: r.detail ?? "",
      ...(mark === "held" ? { held: true } : {}),
    });
  }

  const mints: LedgerMint[] = [];
  for (const r of mintRows) {
    if (!r.dedupeKey) continue;
    const { reason, why } = parseMintDetail(r.detail);
    mints.push({
      key: r.dedupeKey,
      track: isTrack(r.track) ? r.track : null,
      templateId: r.templateId,
      day: keyOfDateColumn(r.day),
      qty: r.qty ?? 0,
      reason,
      why,
    });
  }

  return {
    epochDay: settings?.epochDay ? keyOfDateColumn(settings.epochDay) : null,
    xpByDay,
    compositions,
    weeks,
    mints,
    settledThroughDay: settings?.settledThroughDay ? keyOfDateColumn(settings.settledThroughDay) : null,
  };
}

/**
 * One user's life ledger, through the process cache under 'life' (TRACK
 * writes, the judge and goal closes invalidate it). Before launch, or with no
 * epochDay, it is the empty ledger: nothing reads as life until the lead sets
 * LIFE_LAUNCH_DAY.
 */
export async function loadLifeLedger(userId: string): Promise<LifeLedger> {
  if (!isLaunched(todayKey())) return emptyLifeLedger();
  return cached(`lifeLedger:${userId}`, ["life"], async () => {
    const ledger = await readLifeLedger(userId);
    return ledger.epochDay ? ledger : emptyLifeLedger();
  });
}

/**
 * Serialises a player's life-MP writes (tasks.ts lifeLockOp's pattern, its
 * own key): pg_advisory_xact_lock, transaction-scoped, so it releases at
 * commit or rollback. Put it first in the $transaction array; a guard op
 * after it then reads every row committed by the write that held it before.
 */
export function lifeMintLockOp(userId: string) {
  return prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`life-mint:${userId}`}::text))`;
}

/** A guard op's failure (SELECT 1 / 0): someone else's write landed between this one's read and its commit. */
export function isStaleGuard(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = (err.meta ?? {}) as Record<string, unknown>;
    if (String(meta.code ?? "") === "22012") return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /division by zero|22012/i.test(message);
}

/** The life tracks as of today (now defaults to the current instant). */
export const loadLifeTracks = cache(async (userId: string, now?: Date): Promise<LifeTracksView> => {
  const today = todayKey(now ?? new Date());
  if (!isLaunched(today)) return notLaunchedView(today);
  const ledger = await loadLifeLedger(userId);
  return lifeTracksView(ledger, today);
});
