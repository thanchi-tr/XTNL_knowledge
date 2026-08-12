import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { BOON_META, BOON_KINDS, type BoonKind, type ActiveBoonRow } from "./boon-meta";

/**
 * Spoils Caches — the reward a Boss victory opens.
 *
 * **Why this is not a loot box in the usual sense.** The pattern that makes
 * loot boxes a problem is a *variable reward schedule*: you don't know what
 * you'll get, some outcomes are far better than others, and so there is
 * always a reason to open one more. Every part of that is deliberately
 * absent here:
 *
 *  - You cannot buy, farm, or re-roll a cache. Exactly one is minted per
 *    Boss victory, and victories are already gated by a cooldown and by
 *    having enough genuinely due material to form an encounter.
 *  - The mastery a victory pays is fixed and shown *before* you commit to
 *    the fight (`bossMasteryReward`). The cache never changes that number.
 *  - Every boon in the pool is of comparable worth for the same duration,
 *    so there is no jackpot to chase and no dud to re-roll away from.
 *
 * What is random is only *which* of four equally good buffs you get for the
 * next day. That is variety, not a gamble — the same line this project drew
 * when it put randomness in a Boss's card draw but never in its payout.
 */

export {
  BOON_META,
  BOON_KINDS,
  bestByKind,
  type BoonKind,
  type BoonMeta,
  type ActiveBoonRow,
} from "./boon-meta";

/** Draws one boon. Uniform across the pool — no weighting, because no entry is rarer or better than another. */
export function drawBoon(): BoonKind {
  return BOON_KINDS[Math.floor(Math.random() * BOON_KINDS.length)];
}

export async function grantBoon(
  userId: string,
  kind: BoonKind,
  reason: string,
  now: Date = new Date()
): Promise<ActiveBoonRow> {
  const meta = BOON_META[kind];
  const expiresAt = new Date(now.getTime() + meta.durationHours * 3_600_000);

  await prisma.activeBoon.create({
    data: { userId, kind, magnitude: meta.magnitude, reason, expiresAt },
  });
  invalidate("progress");

  return { kind, magnitude: meta.magnitude, reason, expiresAt };
}

export async function loadActiveBoons(userId: string, now: Date = new Date()): Promise<ActiveBoonRow[]> {
  const rows = await prisma.activeBoon.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    select: { kind: true, magnitude: true, reason: true, expiresAt: true },
  });
  // `kind` is a free string column (same reasoning as MasteryLedgerEntry.reason)
  // — drop anything the current pool no longer recognises.
  return rows.filter((r): r is ActiveBoonRow => (BOON_KINDS as string[]).includes(r.kind));
}

/** Housekeeping for the daily Cron; expired rows are inert either way. */
export async function purgeExpiredBoons(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.activeBoon.deleteMany({ where: { expiresAt: { lte: now } } });
  if (count > 0) invalidate("progress");
  return count;
}
