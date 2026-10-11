import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { domainLevel, fieldLevel } from "./xp";

/**
 * Sub-linear Field/Domain leveling recalculator (spec section 6). Call this
 * after anything mutates a Domain's totalPoints (review reward, degradation
 * penalty, an Idea's initial yieldPoints contribution) — level is derived,
 * not stored authoritatively, so it has to be recomputed rather than
 * incremented/decremented in step with totalPoints.
 */
export async function recalculateLeveling(domainId: string): Promise<{ domainLevel: number; fieldLevel: number }> {
  const domain = await prisma.domain.findUniqueOrThrow({
    where: { id: domainId },
    // Idea levels are the depth half of a Domain's level: points alone are a
    // measure of how much was written, not of how much is known. Archived
    // Ideas are excluded for the same reason they are excluded from routing —
    // they have stopped being recalled.
    include: { ideas: { where: { isArchived: false }, select: { level: true } } },
  });
  const newDomainLevel = domainLevel(
    domain.totalPoints,
    domain.ideas.map((i) => i.level)
  );

  if (newDomainLevel !== domain.level) {
    await prisma.domain.update({ where: { id: domainId }, data: { level: newDomainLevel } });
  }

  // Every sibling's level is recomputed from its own points and Ideas, never read from its stored
  // column: a stored level can be stale (Domains created before 2026-10-11 defaulted to level 1 while
  // empty), and a Field summed from stale levels is how 30 empty Domains read as Field level 30.
  const siblingDomains = await prisma.domain.findMany({
    where: { fieldId: domain.fieldId },
    select: { id: true, level: true, totalPoints: true, ideas: { where: { isArchived: false }, select: { level: true } } },
  });
  const staleSiblings: { id: string; level: number }[] = [];
  const levels = siblingDomains.map((d) => {
    if (d.id === domainId) return newDomainLevel;
    const real = domainLevel(d.totalPoints, d.ideas.map((i) => i.level));
    if (real !== d.level) staleSiblings.push({ id: d.id, level: real });
    return real;
  });
  for (const s of staleSiblings) await prisma.domain.update({ where: { id: s.id }, data: { level: s.level } });
  const newFieldLevel = fieldLevel(levels);

  const field = await prisma.field.findUniqueOrThrow({ where: { id: domain.fieldId } });
  if (newFieldLevel !== field.level) {
    await prisma.field.update({ where: { id: domain.fieldId }, data: { level: newFieldLevel } });
  }

  // The single choke point for level/points changes — everything that moves
  // a Domain's totalPoints routes through here, so invalidating both tags
  // once is enough to keep every cached read honest after a review, a
  // degradation, or an idea submission.
  invalidate("fields", "ideas");

  return { domainLevel: newDomainLevel, fieldLevel: newFieldLevel };
}
