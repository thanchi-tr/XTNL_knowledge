import { prisma } from "./prisma";
import { DEBUFF_META, DEBUFF_KINDS, type DebuffKind, type ActiveDebuffRow } from "./debuff-meta";

/**
 * Debuffs — the mirror image of an unlocked skill. This module owns the
 * database side; the vocabulary and pure folding helpers live in
 * `debuff-meta.ts` so client components can read them without pulling
 * Prisma into the browser bundle.
 *
 * Three rules keep this on the honest side of the line this project has
 * already drawn elsewhere (see the README's "no slot-machine" section):
 *
 * 1. **Never random.** A debuff is always caused by a specific, legible
 *    setback the player can point at — losing a Boss fight they chose to
 *    start, or letting a long Field streak die. Nothing here rolls dice
 *    against the user.
 * 2. **Never destructive.** Debuffs only ever touch `ActiveModifiers`.
 *    They cannot degrade an Idea, remove points, or take a skill away —
 *    the knowledge base is never collateral. The worst a debuff does is
 *    make the next few days' *gains* smaller.
 * 3. **Always self-expiring and bounded.** Every debuff carries its own
 *    `expiresAt` and a magnitude capped by its own table entry, so a bad
 *    week can never compound into an unrecoverable state.
 *
 * Re-applying a debuff that is already active is a refresh, not a stack:
 * `foldDebuffs` takes the single worst magnitude per kind, and the newer
 * row simply carries the later expiry. That falls out of the fold rule
 * rather than needing special-casing at the write site.
 */

export {
  DEBUFF_META,
  DEBUFF_KINDS,
  worstByKind,
  type DebuffKind,
  type DebuffMeta,
  type ActiveDebuffRow,
} from "./debuff-meta";

/** Writes a debuff. Magnitude defaults to (and is clamped by) the kind's own table entry. */
export async function applyDebuff(
  userId: string,
  kind: DebuffKind,
  reason: string,
  now: Date = new Date(),
  magnitude?: number
): Promise<void> {
  const meta = DEBUFF_META[kind];
  const clamped = Math.min(meta.maxMagnitude, Math.max(0, magnitude ?? meta.defaultMagnitude));
  const expiresAt = new Date(now.getTime() + meta.durationHours * 3_600_000);

  await prisma.activeDebuff.create({
    data: { userId, kind, magnitude: clamped, reason, expiresAt },
  });
}

export async function loadActiveDebuffs(userId: string, now: Date = new Date()): Promise<ActiveDebuffRow[]> {
  const rows = await prisma.activeDebuff.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { expiresAt: "desc" },
    select: { kind: true, magnitude: true, reason: true, expiresAt: true },
  });
  // `kind` is a free string column (no DB enum, same reasoning as
  // MasteryLedgerEntry.reason) — drop anything the current pool no longer
  // recognises rather than letting it fold into a modifier by accident.
  return rows.filter((r): r is ActiveDebuffRow => (DEBUFF_KINDS as string[]).includes(r.kind));
}

/** Housekeeping for the daily Cron — expired rows are inert either way, this just stops the table growing forever. */
export async function purgeExpiredDebuffs(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.activeDebuff.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
