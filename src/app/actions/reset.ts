"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { invalidateAll } from "@/lib/cache";
import { domainLevel, fieldLevel } from "@/lib/xp";
import { KNOWLEDGE_SOURCES } from "@/lib/activity";
import type { ResetScope, ResetResult } from "@/lib/reset-scopes";
import { confirmsPhrase, resetSpecOf } from "@/components/settings/settings-model";

/**
 * Destructive resets.
 *
 * **Scope, and why it is structural rather than a promise.** Every statement
 * here goes through this application's own Prisma client, which is bound to
 * this application's `DATABASE_URL`. It therefore cannot reach any other
 * database — the sibling XTNL_thesis project points at a different Supabase
 * project entirely, and nothing in this file can address it. Tables are also
 * named one by one: there is no `DROP SCHEMA`, no `TRUNCATE ... CASCADE`
 * over `information_schema`, and no wildcard. Adding a model to the schema
 * will not silently enrol it in a wipe.
 *
 * **Why a phrase and not a boolean.** A `confirm: true` argument is one
 * mis-wired prop away from deleting everything a user has ever written.
 * Typing the scope's name cannot happen by accident.
 */

/**
 * Every life table's rows for this user, deleted together and in foreign-key
 * order: instances before the templates they reference (the templates' own
 * goal tree sets its links to null as it goes), then the ledger, then the
 * settings. RestDay, Workout, HrBucket, StepInterval and IngestLog join this
 * list with the migrations that create them.
 */
async function deleteLifeRows(userId: string): Promise<Record<string, number>> {
  const [taskInstances, tasks, activityEvents, lifeSettings] = await prisma.$transaction([
    prisma.taskInstance.deleteMany({ where: { userId } }),
    prisma.taskTemplate.deleteMany({ where: { userId } }),
    prisma.activityEvent.deleteMany({ where: { userId } }),
    prisma.lifeSettings.deleteMany({ where: { userId } }),
  ]);
  return {
    taskInstances: taskInstances.count,
    tasks: tasks.count,
    activityEvents: activityEvents.count,
    lifeSettings: lifeSettings.count,
  };
}

/**
 * Wipes part of this knowledge base, or the life system beside it.
 *
 * `confirmation` is what the person typed (DangerZone sends the field's text,
 * never the phrase itself). Trimmed, it must equal the scope's phrase exactly,
 * capitals included: this comparison is the gate, not the client's button.
 */
export async function resetKnowledgeBase(scope: ResetScope, confirmation: string): Promise<ResetResult> {
  const spec = resetSpecOf(scope);
  if (!spec) {
    return { ok: false, error: "Unknown reset scope." };
  }
  if (!confirmsPhrase(spec.phrase, confirmation)) {
    return { ok: false, error: `Type ${spec.phrase} exactly, in capitals, to confirm.` };
  }

  const userId = getCurrentUserId();

  // ── Life only ───────────────────────────────────────────────────────
  // Independent of the knowledge scopes below, which nest inside each other;
  // this one touches no idea, Field or skill.
  if (scope === "life") {
    const deleted = await deleteLifeRows(userId);
    invalidateAll();
    const [ideas, fields, unlockedSkills, masteryEntries] = await Promise.all([
      prisma.idea.count(),
      prisma.field.count(),
      prisma.unlockedSkill.count(),
      prisma.masteryLedgerEntry.count(),
    ]);
    return { ok: true, value: { scope, deleted, preserved: { ideas, fields, unlockedSkills, masteryEntries } } };
  }

  const deleted: Record<string, number> = {};

  // ── Ideas, always ───────────────────────────────────────────────────
  // IdeaEnrichment cascades from Idea, so it is counted before the delete
  // rather than deleted separately.
  deleted.enrichments = await prisma.ideaEnrichment.count();
  deleted.ideas = (await prisma.idea.deleteMany({})).count;
  // The knowledge side's rows in the life ledger go with the ideas they
  // record: reviews, new ideas, attestations, boss fights, the pre-ledger
  // streak days. Tasks and their XP are not knowledge and stay.
  deleted.knowledgeEvents = (
    await prisma.activityEvent.deleteMany({ where: { userId, source: { in: KNOWLEDGE_SOURCES } } })
  ).count;

  if (scope === "ideas") {
    // Points and levels are derived from Ideas, so with none left they must
    // return to what a brand-new domain looks like — otherwise a wiped
    // account keeps levels it can no longer justify.
    // Both halves of the level are empty: no points, and no Ideas to have
    // demonstrated depth with.
    const zeroLevel = domainLevel(0, []);
    await prisma.domain.updateMany({
      data: { totalPoints: 0, level: zeroLevel, attributeObservations: 0 },
    });
    await prisma.field.updateMany({ data: { level: fieldLevel([]) } });
    // Snapshots chart points over time; leaving them would draw history for
    // points that no longer exist.
    deleted.snapshots = (await prisma.fieldSnapshot.deleteMany({})).count;

    invalidateAll();
    return {
      ok: true,
      value: {
        scope,
        deleted,
        preserved: {
          fields: await prisma.field.count(),
          domains: await prisma.domain.count(),
          unlockedSkills: await prisma.unlockedSkill.count(),
          masteryEntries: await prisma.masteryLedgerEntry.count(),
          tasks: await prisma.taskTemplate.count({ where: { userId } }),
        },
      },
    };
  }

  // ── Taxonomy ────────────────────────────────────────────────────────
  // DomainAttribute, FieldAttribute, FieldSnapshot, FieldStreak and
  // BossEncounter all cascade from Domain/Field; counted first so the
  // report is accurate.
  deleted.domainAttributes = await prisma.domainAttribute.count();
  deleted.fieldAttributes = await prisma.fieldAttribute.count();
  deleted.snapshots = await prisma.fieldSnapshot.count();
  deleted.fieldStreaks = await prisma.fieldStreak.count();
  deleted.domains = (await prisma.domain.deleteMany({})).count;
  deleted.fields = (await prisma.field.deleteMany({})).count;

  if (scope === "knowledge") {
    invalidateAll();
    return {
      ok: true,
      value: {
        scope,
        deleted,
        preserved: {
          unlockedSkills: await prisma.unlockedSkill.count(),
          masteryEntries: await prisma.masteryLedgerEntry.count(),
          tasks: await prisma.taskTemplate.count({ where: { userId } }),
        },
      },
    };
  }

  // ── Progression ─────────────────────────────────────────────────────
  // Scoped to the current user: these tables carry a userId, and a reset
  // should not reach across accounts even on a single-tenant instance.
  deleted.unlockedSkills = (await prisma.unlockedSkill.deleteMany({ where: { userId } })).count;
  deleted.masteryEntries = (await prisma.masteryLedgerEntry.deleteMany({ where: { userId } })).count;
  deleted.activeBoons = (await prisma.activeBoon.deleteMany({ where: { userId } })).count;
  deleted.activeDebuffs = (await prisma.activeDebuff.deleteMany({ where: { userId } })).count;
  // Capital and augments were missed here before, so "a completely new
  // account" kept its passive currency and its emblem upgrades.
  deleted.capitalEntries = (await prisma.capitalLedgerEntry.deleteMany({ where: { userId } })).count;
  deleted.augments = (await prisma.emblemAugment.deleteMany({ where: { userId } })).count;
  Object.assign(deleted, await deleteLifeRows(userId));

  invalidateAll();
  return { ok: true, value: { scope, deleted, preserved: {} } };
}

/** Row counts, so the danger zone can state exactly what is at stake. */
export async function getResetPreview(): Promise<Record<string, number>> {
  const userId = getCurrentUserId();
  const [
    ideas,
    enrichments,
    domains,
    fields,
    snapshots,
    unlockedSkills,
    masteryEntries,
    capitalEntries,
    augments,
    tasks,
    taskInstances,
    activityEvents,
  ] = await Promise.all([
    prisma.idea.count(),
    prisma.ideaEnrichment.count(),
    prisma.domain.count(),
    prisma.field.count(),
    prisma.fieldSnapshot.count(),
    prisma.unlockedSkill.count(),
    prisma.masteryLedgerEntry.count(),
    prisma.capitalLedgerEntry.count({ where: { userId } }),
    prisma.emblemAugment.count({ where: { userId } }),
    prisma.taskTemplate.count({ where: { userId } }),
    prisma.taskInstance.count({ where: { userId } }),
    prisma.activityEvent.count({ where: { userId } }),
  ]);
  return {
    ideas,
    enrichments,
    domains,
    fields,
    snapshots,
    unlockedSkills,
    masteryEntries,
    capitalEntries,
    augments,
    tasks,
    taskInstances,
    activityEvents,
  };
}
