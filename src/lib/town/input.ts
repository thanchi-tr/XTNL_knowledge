import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadFieldLevels } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getDailyStreak } from "@/lib/streak";
import { depthOf } from "@/lib/skill-form";
import { dueCutoff } from "@/lib/due";
import { schoolOf, type School, type TownInput } from "./rules";

/**
 * Reads the player's real knowledge into the town's rule inputs.
 *
 * Server-only. Nothing here is invented for the town: every number is one the
 * rest of the app already tracks — Field levels, attribute scores, the
 * streak, the loadout — which is the point. The town is a lens on progress,
 * so it must not have a progress bar of its own.
 */
export async function loadTownInput(userId: string): Promise<TownInput> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [fields, progression, streak, recent, reviewsToday, domains, dueRemaining, newIdeasToday] = await Promise.all([
    loadFieldLevels(),
    loadProgression(userId),
    getDailyStreak(),
    prisma.idea.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { domain: { select: { field: { select: { name: true } } } } },
    }),
    // `updatedAt` moves on every review; it is the same approximate activity
    // signal the streak already uses, so the two cannot disagree.
    prisma.idea.count({ where: { updatedAt: { gte: dayStart }, isArchived: false } }),
    prisma.domain.findMany({ select: { level: true } }),
    // The same "due" the review queue uses: anything scheduled on or before today.
    prisma.idea.count({ where: { isArchived: false, dueDate: { lte: dueCutoff(new Date()) } } }),
    prisma.idea.count({ where: { createdAt: { gte: dayStart } } }),
  ]);

  const schools: Record<School, number> = { commerce: 0, science: 0, mind: 0 };
  for (const f of fields) {
    const s = schoolOf(f.name);
    if (s) schools[s] += f.level;
  }

  const newIdeasThisWeek: Record<School, number> = { commerce: 0, science: 0, mind: 0 };
  for (const r of recent) {
    const s = schoolOf(r.domain.field.name);
    if (s) newIdeasThisWeek[s] += 1;
  }

  const equippedAttributes: Attribute[] = progression.activeSkills.flatMap((s) => s.attributes);
  const peakDepth = progression.activeSkills.reduce((m, s) => Math.max(m, depthOf(s)), 0);

  return {
    schools,
    scores: progression.scores,
    streakDays: streak.current,
    equippedAttributes,
    peakDepth,
    reviewsToday,
    newIdeasThisWeek,
    emblems: progression.activeSkills.map((s) => ({ code: s.code, name: s.name, attributes: s.attributes, depth: depthOf(s) })),
    domainPeak: domains.reduce((m, d) => Math.max(m, d.level), 0),
    domainSum: domains.reduce((a, d) => a + d.level, 0),
    dueRemaining,
    newIdeasToday,
  };
}
