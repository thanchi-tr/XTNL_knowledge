import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { BOON_META, BOON_KINDS, type BoonKind, type ActiveBoonRow } from "./boon-meta";

/**
 * Boons — the reward a Boss victory opens, chosen by the player.
 *
 * A victory used to open a "Spoils Cache" that drew one of four boons at
 * random. Even with every boon of comparable worth, a surprise draw on a
 * reward is the variable-ratio pattern this project refuses, so the draw is
 * gone: a victory now offers every boon and the player picks one
 * (bosses.ts claimBossBoon, once per victory, within BOSS_BOON_CLAIM_HOURS).
 *
 *  - You cannot buy, farm, or re-roll a boon. Exactly one is granted per
 *    Boss victory, and victories are already gated by a cooldown and by
 *    having enough genuinely due material to form an encounter.
 *  - The mastery a victory pays is fixed and shown *before* you commit to
 *    the fight (`bossMasteryReward`). The boon never changes that number.
 *  - Every boon in the pool is of comparable worth for the same duration,
 *    so the choice is about what tomorrow's study needs, not a jackpot.
 */

export {
  BOON_META,
  BOON_KINDS,
  bestByKind,
  type BoonKind,
  type BoonMeta,
  type ActiveBoonRow,
} from "./boon-meta";

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
