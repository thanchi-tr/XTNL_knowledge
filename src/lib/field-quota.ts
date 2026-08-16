import { prisma } from "./prisma";
import { cached } from "./cache";
import { applyDebuff } from "./debuffs";
import { loadMaintenanceIds } from "./field-focus";

/**
 * The weekly contribution quota: how many new Ideas each Field owes per week,
 * and what missing it costs.
 *
 * Every other pressure in this app points at *review* — cards come due, grace
 * lapses, streaks break. Nothing pushed you to keep writing, so a mature Field
 * could sit at level 12 indefinitely on recall alone while its actual subject
 * moved on. The quota is the counterweight: a Field you have invested in owes
 * you new material, and the more invested it is, the more it owes.
 *
 * Sub-linear in level, matching every other curve in this codebase. A new
 * Field asks for one Idea a week; a level-9 Field asks for four; a level-36
 * Field asks for seven. Capped, because the point is a steady habit rather
 * than an escalating tax that eventually makes a strong Field unmaintainable.
 */

/** Nobody is asked for less than this while the Field exists at all. */
const QUOTA_FLOOR = 1;
/** Ceiling on the weekly ask, however high a Field climbs. */
export const QUOTA_CAP = 7;

export function weeklyQuotaFor(fieldLevel: number): number {
  return Math.min(QUOTA_CAP, QUOTA_FLOOR + Math.floor(Math.sqrt(Math.max(1, fieldLevel))));
}

/**
 * Monday 00:00 UTC. Same anchor `tryConsumeWardCharge` uses for its weekly
 * charges, so "this week" means one thing across the whole app rather than
 * drifting by feature.
 */
export function currentWeekAnchor(now: Date = new Date()): Date {
  const d = new Date(now);
  const diffToMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export interface FieldQuota {
  fieldId: string;
  fieldName: string;
  fieldLevel: number;
  quota: number;
  /** Non-archived Ideas created in this Field since the week anchor. */
  added: number;
  /** How many more are owed. 0 once the quota is met. */
  short: number;
  met: boolean;
}

async function loadQuotasUncached(weekStart: Date): Promise<FieldQuota[]> {
  const fields = await prisma.field.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      level: true,
      domains: {
        select: {
          _count: { select: { ideas: { where: { isArchived: false, createdAt: { gte: weekStart } } } } },
        },
      },
    },
  });

  return fields.map((f) => {
    const added = f.domains.reduce((sum, d) => sum + d._count.ideas, 0);
    const quota = weeklyQuotaFor(f.level);
    return {
      fieldId: f.id,
      fieldName: f.name,
      fieldLevel: f.level,
      quota,
      added,
      short: Math.max(0, quota - added),
      met: added >= quota,
    };
  });
}

/**
 * Every Field's standing for the current week.
 *
 * Fields in maintenance are dropped entirely rather than reported as met:
 * they are not owed, so showing them as satisfying a quota would misstate
 * what the player is actually being asked for.
 */
export async function loadWeeklyQuotas(userId: string, now: Date = new Date()): Promise<FieldQuota[]> {
  const weekStart = currentWeekAnchor(now);
  const [all, maintained] = await Promise.all([
    cached(`quotas:${weekStart.toISOString()}`, ["fields", "ideas"], () => loadQuotasUncached(weekStart)),
    loadMaintenanceIds(userId),
  ]);
  return all.filter((q) => !maintained.has(q.fieldId));
}

// ============================================================================
// Enforcement
// ============================================================================

/** Yield lost per Field that came up short. */
const PENALTY_PER_FIELD = 0.08;
/** Hard ceiling, mirroring `DEBUFF_META.STAGNATION.maxMagnitude`. */
const PENALTY_CAP = 0.3;

export type QuotaEnforcement =
  | { status: "skipped"; why: "already_run" | "no_fields" }
  | { status: "clear"; fields: number }
  | { status: "penalised"; shortFields: string[]; magnitude: number };

/**
 * Judges the week that just ended and, if any Field came up short, applies a
 * single Stagnation debuff.
 *
 * One debuff for the whole account rather than one per Field: `foldDebuffs`
 * keeps only the worst magnitude per kind, so per-Field rows would silently
 * collapse to the same effect while making the UI claim several penalties.
 * Magnitude scales with how many Fields were neglected instead, which is the
 * honest encoding of the same information.
 *
 * **Idempotency** rides on the debuff's own lifetime. Stagnation lasts a full
 * week by design — the penalty should hold until you get another chance at
 * the quota — which means the row is still present for every later Cron run
 * in that week, and `findFirst` below sees it. That coupling is deliberate
 * but load-bearing: shortening the duration below a week would let the daily
 * Cron re-apply it. `STAGNATION_MIN_HOURS` documents the floor.
 */
export const STAGNATION_MIN_HOURS = 168;

export async function enforceWeeklyQuotas(
  userId: string,
  now: Date = new Date()
): Promise<QuotaEnforcement> {
  const weekStart = currentWeekAnchor(now);

  const alreadyRun = await prisma.activeDebuff.findFirst({
    where: { userId, kind: "STAGNATION", createdAt: { gte: weekStart } },
    select: { id: true },
  });
  if (alreadyRun) return { status: "skipped", why: "already_run" };

  // The week being judged is the one that just closed, not the one underway.
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  const [all, maintained] = await Promise.all([
    loadQuotasUncached(lastWeekStart),
    loadMaintenanceIds(userId),
  ]);
  // Maintenance is checked at judgement time, not at the start of the week:
  // putting a Field down mid-week should excuse it, not punish a decision the
  // player has already made.
  const quotas = all.filter((q) => !maintained.has(q.fieldId));
  if (quotas.length === 0) return { status: "skipped", why: "no_fields" };

  // A Field created mid-week was never given a full week to meet its quota,
  // so it is exempt from the first judgement it would otherwise face.
  const judged = quotas.filter((q) => q.quota > 0);
  const short = judged.filter((q) => !q.met);
  if (short.length === 0) return { status: "clear", fields: judged.length };

  const magnitude = Math.min(PENALTY_CAP, short.length * PENALTY_PER_FIELD);
  const names = short.map((q) => q.fieldName);
  await applyDebuff(
    userId,
    "STAGNATION",
    `QUOTA_MISSED: ${names.join(", ")}`,
    now,
    magnitude
  );

  return { status: "penalised", shortFields: names, magnitude };
}
