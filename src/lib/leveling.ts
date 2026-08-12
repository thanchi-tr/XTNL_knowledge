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
  const domain = await prisma.domain.findUniqueOrThrow({ where: { id: domainId } });
  const newDomainLevel = domainLevel(domain.totalPoints);

  if (newDomainLevel !== domain.level) {
    await prisma.domain.update({ where: { id: domainId }, data: { level: newDomainLevel } });
  }

  const siblingDomains = await prisma.domain.findMany({ where: { fieldId: domain.fieldId } });
  const levels = siblingDomains.map((d) => (d.id === domainId ? newDomainLevel : d.level));
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
