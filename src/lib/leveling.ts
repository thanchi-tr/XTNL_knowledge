import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { planFieldLevels, type FieldLevelPlan, type LevelingField } from "./forgetting";
import { loadModifiers } from "./skill-effects";
import { getCurrentUserId } from "./user";

/**
 * Sub-linear Field/Domain leveling recalculator (spec section 6). Call this
 * after anything mutates a Domain's totalPoints (review reward, degradation
 * penalty, an Idea's initial yieldPoints contribution) — level is derived,
 * not stored authoritatively, so it has to be recomputed rather than
 * incremented/decremented in step with totalPoints.
 *
 * Retention-weighted (2026-10-13): a Domain's depth counts each Idea by how
 * well it is still remembered (forgetting.ts retentionFactor), so a level
 * also moves with time alone. The review path and the daily job
 * (recomputeAllLevels) both recompute; a stored level that falls records
 * where it fell from and when (droppedFrom, droppedAt: the Library and the
 * bell say "fell to L3"), and a rise back to that level clears it.
 */

/** The Ideas a level reads: not archived (they have stopped being recalled), with what their retention needs (the ease scales its curve). */
const IDEA_DEPTH = { where: { isArchived: false }, select: { level: true, dueDate: true, ease: true } } as const;
const LEVELING_FIELD = {
  id: true,
  level: true,
  droppedFrom: true,
  domains: { select: { id: true, level: true, totalPoints: true, droppedFrom: true, ideas: IDEA_DEPTH } },
} as const;

export interface LevelingOptions {
  /** The moment the levels are read at (retention moves with it). */
  now?: Date;
  /** GRACE_EXTENSION, when the caller already holds its modifiers; otherwise read (cached). */
  graceExtraDays?: number;
}

async function graceExtraOf(opts: LevelingOptions | undefined): Promise<number> {
  if (opts?.graceExtraDays != null) return Math.max(0, opts.graceExtraDays);
  try {
    return Math.max(0, (await loadModifiers(getCurrentUserId())).graceExtraDays || 0);
  } catch {
    return 0;
  }
}

/** The writes a plan needs: each changed Domain and the Field, with their drop records. */
function writesOf(plan: FieldLevelPlan): Prisma.PrismaPromise<unknown>[] {
  const ops: Prisma.PrismaPromise<unknown>[] = plan.domainWrites.map((w) =>
    prisma.domain.update({ where: { id: w.id }, data: { level: w.level, ...(w.drop ?? {}) } })
  );
  if (plan.fieldWrite) {
    const w = plan.fieldWrite;
    ops.push(prisma.field.update({ where: { id: w.id }, data: { level: w.level, ...(w.drop ?? {}) } }));
  }
  return ops;
}

export async function recalculateLeveling(
  domainId: string,
  opts?: LevelingOptions
): Promise<{ domainLevel: number; fieldLevel: number; /** The Domain's retained share now (xp.ts retainedShare). */ domainRetention: number }> {
  const now = opts?.now ?? new Date();
  // The Domain's whole Field in one joined read: every sibling's level is recomputed from its own points and Ideas,
  // never read from its stored column (a stale stored level is how 30 empty Domains once read as Field level 30).
  const [domain, graceExtra] = await Promise.all([
    prisma.domain.findUniqueOrThrow({
      where: { id: domainId },
      relationLoadStrategy: "join",
      select: { field: { select: LEVELING_FIELD } },
    }),
    graceExtraOf(opts),
  ]);
  const plan = planFieldLevels(domain.field as LevelingField, now, graceExtra);
  const ops = writesOf(plan);
  if (ops.length > 0) await prisma.$transaction(ops);

  // The single choke point for level/points changes — everything that moves
  // a Domain's totalPoints routes through here, so invalidating both tags
  // once is enough to keep every cached read honest after a review, a
  // degradation, or an idea submission.
  invalidate("fields", "ideas");

  return { domainLevel: plan.domainLevels.get(domainId) ?? 0, fieldLevel: plan.fieldLevel, domainRetention: plan.domainRetention.get(domainId) ?? 1 };
}

/** Fields read and written per batch by the daily recompute. */
const RECOMPUTE_BATCH = 25;

/**
 * The daily job's level pass (api/cron/degrade, after degradeOverdueIdeas): every Domain and Field recomputed at
 * `now`, so retention that fell overnight lowers a neglected Domain, then its Field, before any Idea loses a level.
 * Fields are read and written RECOMPUTE_BATCH at a time, each batch's writes in one transaction. Idempotent: a second
 * run at the same moment writes nothing (only levels that differ are written).
 */
export async function recomputeAllLevels(opts?: LevelingOptions): Promise<{ fields: number; domainsChanged: number; fieldsChanged: number; drops: number }> {
  const now = opts?.now ?? new Date();
  const graceExtra = await graceExtraOf(opts);
  const ids = (await prisma.field.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((f) => f.id);
  let domainsChanged = 0;
  let fieldsChanged = 0;
  let drops = 0;
  for (let i = 0; i < ids.length; i += RECOMPUTE_BATCH) {
    const fields = await prisma.field.findMany({ where: { id: { in: ids.slice(i, i + RECOMPUTE_BATCH) } }, select: LEVELING_FIELD });
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const f of fields) {
      const plan = planFieldLevels(f as LevelingField, now, graceExtra);
      domainsChanged += plan.domainWrites.length;
      fieldsChanged += plan.fieldWrite ? 1 : 0;
      drops += plan.domainWrites.filter((w) => w.drop?.droppedAt != null).length + (plan.fieldWrite?.drop?.droppedAt != null ? 1 : 0);
      ops.push(...writesOf(plan));
    }
    if (ops.length > 0) await prisma.$transaction(ops);
  }
  if (domainsChanged + fieldsChanged > 0) invalidate("fields", "ideas");
  return { fields: ids.length, domainsChanged, fieldsChanged, drops };
}
