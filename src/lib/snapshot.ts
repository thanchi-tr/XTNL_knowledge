import { prisma } from "./prisma";

function truncateToDay(d: Date): Date {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t;
}

/**
 * Writes (upserts) today's snapshot for every Field. Safe to call on every
 * Dashboard view — `@@unique([fieldId, day])` means calling it 50 times in
 * one day just overwrites the same row with the latest numbers, which is
 * exactly what we want (today's snapshot should reflect today's current
 * state, not the state at whatever moment it was first written).
 */
export async function recordTodaySnapshot(): Promise<void> {
  const day = truncateToDay(new Date());
  const fields = await prisma.field.findMany({
    include: { domains: { select: { totalPoints: true } } },
  });

  await Promise.all(
    fields.map((f) =>
      prisma.fieldSnapshot.upsert({
        where: { fieldId_day: { fieldId: f.id, day } },
        create: {
          fieldId: f.id,
          day,
          level: f.level,
          totalPoints: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
        },
        update: {
          level: f.level,
          totalPoints: f.domains.reduce((sum, d) => sum + d.totalPoints, 0),
        },
      })
    )
  );
}

export interface GhostFieldLevel {
  fieldName: string;
  level: number;
}

/**
 * The snapshot from exactly 7 days ago, per Field — the "ghost" the Dashboard
 * radar compares against. Returns an empty array until snapshots have
 * actually been accumulating for a week; there's no synthetic fallback.
 */
export async function getGhostLevelsFromDaysAgo(daysAgo: number): Promise<GhostFieldLevel[]> {
  const day = truncateToDay(new Date());
  day.setUTCDate(day.getUTCDate() - daysAgo);

  const rows = await prisma.fieldSnapshot.findMany({
    where: { day },
    include: { field: { select: { name: true } } },
  });

  return rows.map((r) => ({ fieldName: r.field.name, level: r.level }));
}
