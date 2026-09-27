import type { Attribute } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadFieldLevels } from "@/lib/queries";
import { loadProgression } from "@/lib/skill-effects";
import { getDailyStreak } from "@/lib/streak";
import { depthOf } from "@/lib/skill-form";
import { dueCutoff } from "@/lib/due";
import { schoolOf, type FieldDaily, type School, type TownInput } from "./rules";

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

  const [fields, progression, streak, recent, reviewsToday, domains, dueRemaining, newIdeasToday, daily] = await Promise.all([
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
    loadFieldDaily(userId, dayStart, weekAgo),
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
    fields: daily,
    day: localDay(dayStart),
  };
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Each Field's day: ideas added, cards reviewed, cards still due and long
 * overdue, its streak and what it trains. One grouped query over the ideas,
 * plus the attribute split and the streak rows the rest of the app keeps.
 */
async function loadFieldDaily(userId: string, dayStart: Date, weekAgo: Date): Promise<FieldDaily[]> {
  const cutoff = dueCutoff(new Date());
  const overdueCut = new Date(dayStart.getTime() - 86_400_000);
  const [fields, counts, attrs, streaks] = await Promise.all([
    prisma.field.findMany({ select: { id: true, name: true, level: true } }),
    prisma.$queryRaw<{ field: string; ideas_today: bigint; ideas_week: bigint; reviewed_today: bigint; due: bigint; overdue: bigint }[]>`
      SELECT d."fieldId" AS field,
        COUNT(*) FILTER (WHERE i."createdAt" >= ${dayStart}) AS ideas_today,
        COUNT(*) FILTER (WHERE i."createdAt" >= ${weekAgo}) AS ideas_week,
        COUNT(*) FILTER (WHERE i."updatedAt" >= ${dayStart} AND i."createdAt" < ${dayStart}) AS reviewed_today,
        COUNT(*) FILTER (WHERE NOT i."isArchived" AND i."dueDate" <= ${cutoff}) AS due,
        COUNT(*) FILTER (WHERE NOT i."isArchived" AND i."dueDate" < ${overdueCut}) AS overdue
      FROM "Idea" i JOIN "Domain" d ON d.id = i."domainId"
      GROUP BY d."fieldId"
    `,
    prisma.fieldAttribute.findMany({ select: { fieldId: true, attribute: true, weight: true } }),
    prisma.fieldStreak.findMany({ where: { userId }, select: { fieldId: true, currentDays: true, bestDays: true, lastActiveDay: true } }),
  ]);
  const byField = new Map(counts.map((c) => [c.field, c]));
  const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const yesterdayUtc = new Date(todayUtc.getTime() - 86_400_000);
  return fields.map((f) => {
    const c = byField.get(f.id);
    const n = (x: bigint | undefined) => Number(x ?? 0);
    const top = attrs.filter((a) => a.fieldId === f.id).sort((a, b) => b.weight - a.weight).slice(0, 2).map((a) => a.attribute);
    const st = streaks.find((x) => x.fieldId === f.id);
    // A streak is alive through today if its last active day is today or yesterday.
    const alive = st && st.lastActiveDay.getTime() >= yesterdayUtc.getTime();
    const reviewedToday = n(c?.reviewed_today);
    const dueRemaining = n(c?.due);
    return {
      id: f.id,
      name: f.name,
      school: schoolOf(f.name),
      level: f.level,
      attrs: top,
      ideasToday: n(c?.ideas_today),
      ideasWeek: n(c?.ideas_week),
      reviewedToday,
      dueRemaining,
      overdue: n(c?.overdue),
      streak: alive ? st!.currentDays : 0,
      bestStreak: st?.bestDays ?? 0,
      complete: reviewedToday > 0 && dueRemaining === 0,
    };
  });
}
