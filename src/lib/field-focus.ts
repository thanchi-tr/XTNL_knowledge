import { prisma } from "./prisma";
import { cached, invalidate } from "./cache";

/**
 * Fields of interest, and the maintenance mode that is their opposite.
 *
 * A knowledge base outlives the attention of the person keeping it. Subjects
 * go quiet for a season without being abandoned, and before this the app had
 * no way to say so: every Field owed new Ideas every week and fielded its own
 * Boss, so a library of eight subjects demanded active work on all eight
 * forever, and the weekly Stagnation penalty landed for the entirely
 * reasonable act of concentrating on two of them.
 *
 * Maintenance mode is that admission. A maintained Field keeps *reviewing*
 * exactly as before — its Ideas come due, degrade on neglect, pay their
 * points, feed attribute scores. What it loses is the two things that ask for
 * fresh attention: the weekly new-Idea quota, and Boss encounters.
 *
 * **Stored as the exception.** The table records maintained Fields, not
 * interesting ones, so an empty table means "everything is of interest" —
 * exactly the pre-existing behaviour, no backfill, and no state where
 * clearing the table silently switches off every challenge and quota at once.
 */

/** Field ids the given user has put into maintenance. */
export async function loadMaintenanceIds(userId: string): Promise<Set<string>> {
  const ids = await cached(`maintenance:${userId}`, ["fields"], async () => {
    const rows = await prisma.fieldMaintenance.findMany({ where: { userId }, select: { fieldId: true } });
    return rows.map((r) => r.fieldId);
  });
  return new Set(ids);
}

export interface FieldFocus {
  fieldId: string;
  fieldName: string;
  fieldLevel: number;
  /** False when this Field is in maintenance. */
  interested: boolean;
  /** Non-archived Ideas — a maintained Field still carries and reviews these. */
  ideaCount: number;
}

/** Every Field with its focus state, for the overview's picker. */
export async function loadFieldFocus(userId: string): Promise<FieldFocus[]> {
  const [fields, maintained] = await Promise.all([
    cached("focusFields", ["fields", "ideas"], () =>
      prisma.field.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          level: true,
          domains: { select: { _count: { select: { ideas: { where: { isArchived: false } } } } } },
        },
      })
    ),
    loadMaintenanceIds(userId),
  ]);

  return fields.map((f) => ({
    fieldId: f.id,
    fieldName: f.name,
    fieldLevel: f.level,
    interested: !maintained.has(f.id),
    ideaCount: f.domains.reduce((sum, d) => sum + d._count.ideas, 0),
  }));
}

/**
 * Sets one Field's focus.
 *
 * Idempotent in both directions — `deleteMany`/`upsert` rather than
 * delete/create — so a double-click or a retried action cannot throw on a
 * row that is already in the state being asked for.
 */
export async function setFieldInterest(userId: string, fieldId: string, interested: boolean): Promise<void> {
  if (interested) {
    await prisma.fieldMaintenance.deleteMany({ where: { userId, fieldId } });
  } else {
    await prisma.fieldMaintenance.upsert({
      where: { userId_fieldId: { userId, fieldId } },
      create: { userId, fieldId },
      update: {},
    });
  }
  // "fields" covers the focus read itself and the quota; "progress" covers
  // the Boss roster, which is keyed on the same set.
  invalidate("fields", "progress");
}
