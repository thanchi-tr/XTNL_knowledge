"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { invalidateAll } from "@/lib/cache";
import { domainLevel, fieldLevel } from "@/lib/xp";
import { KNOWLEDGE_SOURCES } from "@/lib/activity";
import { ROADMAP_RESET_EFFECT, ROADMAP_RESET_TABLES, lifeResetOrder, resetArchiveReason, type LifeResetTable, type ResetScope, type ResetResult } from "@/lib/reset-scopes";
import { isMissingRestDayTable } from "@/lib/rest-rules";
import { isMissingRoadmapTable, type RoadmapStatus } from "@/lib/roadmap-types";
import { todayKey } from "@/lib/life-day";
import { shortDate, weekdayName } from "@/lib/today-board";
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

/** One life table's delete for this user, by the key reset-scopes.ts LIFE_RESET_ORDER names it. */
function lifeDeleteOp(table: LifeResetTable, userId: string) {
  switch (table) {
    case "taskInstances":
      return prisma.taskInstance.deleteMany({ where: { userId } });
    case "tasks":
      return prisma.taskTemplate.deleteMany({ where: { userId } });
    case "restDays":
      return prisma.restDay.deleteMany({ where: { userId } });
    case "activityEvents":
      return prisma.activityEvent.deleteMany({ where: { userId } });
    case "roadmapReadings":
      // Every reading of the user's roadmaps: measures, PROFICIENCY and the self-logged checkpoints.
      return prisma.roadmapReading.deleteMany({ where: { userId } });
    case "roadmaps":
      // Cascades to the runs, milestones, items, measures, acceptances and quest weeks.
      return prisma.roadmap.deleteMany({ where: { userId } });
    case "lifeSettings":
      return prisma.lifeSettings.deleteMany({ where: { userId } });
  }
}

/**
 * Every life table's rows for this user, deleted together and in foreign-key
 * order (reset-scopes.ts LIFE_RESET_ORDER): instances before the templates
 * they reference (the templates' own goal tree sets its links to null as it
 * goes), then the declared rest days (M2), the ledger, and the settings.
 * The settlement cursor goes with the settings; the next LifeSettings row
 * is created through newLifeSettingsData, so after Duty's launch settlement
 * resumes from the new epoch with no launch script run (M2 F18).
 *
 * Before the life_duty migration is applied the RestDay table does not
 * exist: the whole array rolls back on it (P2021 / 42P01), and the reset runs
 * again without it, so a deploy that lands first never half-resets. The
 * roadmap's tables (roadmap.md F16 seam 11: its readings, and the Roadmap
 * rows whose delete cascades to the rest of it) are retried away the same
 * way while life_roadmap is not applied (isMissingRoadmapTable). Each retry
 * drops one missing group, so the loop ends within three runs, and a skipped
 * table reports 0.
 */
async function deleteLifeRows(userId: string): Promise<Record<string, number>> {
  const run = async (tables: readonly LifeResetTable[]) => {
    const results = await prisma.$transaction(tables.map((table) => lifeDeleteOp(table, userId)));
    const deleted: Record<string, number> = {};
    tables.forEach((table, i) => {
      deleted[table] = results[i].count;
    });
    return deleted;
  };
  let withRestDays = true;
  let withRoadmaps = true;
  for (;;) {
    try {
      const deleted = await run(lifeResetOrder(withRestDays, withRoadmaps));
      if (!withRestDays) deleted.restDays = 0;
      if (!withRoadmaps) for (const table of ROADMAP_RESET_TABLES) deleted[table] = 0;
      return deleted;
    } catch (err) {
      if (withRestDays && isMissingRestDayTable(err)) withRestDays = false;
      else if (withRoadmaps && isMissingRoadmapTable(err)) withRoadmaps = false;
      else throw err;
    }
  }
}

/** The open roadmap statuses (decision 15: at most one DRAFT or ACTIVE per user). */
const OPEN_ROADMAP: RoadmapStatus[] = ["DRAFT", "ACTIVE"];

/**
 * 'ideas' and 'knowledge' (roadmap.md F16 seam 11): the open roadmap's
 * measures count cards and Domains this reset removes, so it is archived
 * with "measures removed by a reset on <day>" (reset-scopes.ts
 * resetArchiveReason). Its readings, quest weeks and Aim rank stay as
 * history; no week quest set is frozen for it again, and its open milestone
 * goal stays on Today with no series, so g is null and it pays 0, "not
 * measured". Like the rest of the reset this is the user's own typed
 * decision, so it runs wherever the ideas are deleted. 0 while the
 * life_roadmap migration is not applied.
 */
async function archiveRoadmapsForReset(userId: string, now: Date): Promise<number> {
  const today = todayKey(now);
  try {
    const res = await prisma.roadmap.updateMany({
      where: { userId, status: { in: OPEN_ROADMAP } },
      data: { status: "ARCHIVED" satisfies RoadmapStatus, archivedAt: now, archiveReason: resetArchiveReason(`${weekdayName(today)} ${shortDate(today)}`) },
    });
    return res.count;
  } catch (err) {
    if (isMissingRoadmapTable(err)) return 0;
    throw err;
  }
}

/** RestDay's row count for the danger zone; 0 while its table does not exist yet (life_duty not applied). */
async function countRestDays(userId: string): Promise<number> {
  try {
    return await prisma.restDay.count({ where: { userId } });
  } catch (err) {
    if (isMissingRestDayTable(err)) return 0;
    throw err;
  }
}

/**
 * The danger zone's roadmap counts (roadmap.md F16 seam 11): every roadmap
 * ('life' and 'everything' delete them) and the open ones ('ideas' and
 * 'knowledge' archive them). Both 0 while life_roadmap is not applied.
 */
async function countRoadmaps(userId: string): Promise<{ roadmaps: number; openRoadmaps: number }> {
  try {
    const rows = await prisma.roadmap.findMany({ where: { userId }, select: { status: true } });
    return { roadmaps: rows.length, openRoadmaps: rows.filter((r) => (OPEN_ROADMAP as string[]).includes(r.status)).length };
  } catch (err) {
    if (isMissingRoadmapTable(err)) return { roadmaps: 0, openRoadmaps: 0 };
    throw err;
  }
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

  // 'Everything' empties the life tables first: they are the one
  // transaction here, so if it fails nothing else has been deleted yet.
  // Their ledger delete takes the knowledge rows with it.
  if (scope === "everything") Object.assign(deleted, await deleteLifeRows(userId));

  // ── The roadmap (roadmap.md F16 seam 11) ────────────────────────────
  // 'ideas' and 'knowledge' archive the open roadmap before its cards go, so
  // a failure here deletes nothing; 'everything' deleted it with the life rows.
  if (ROADMAP_RESET_EFFECT[scope] === "archive") deleted.roadmapsArchived = await archiveRoadmapsForReset(userId, new Date());

  // ── Ideas, always ───────────────────────────────────────────────────
  // IdeaEnrichment cascades from Idea, so it is counted before the delete
  // rather than deleted separately.
  deleted.enrichments = await prisma.ideaEnrichment.count();
  deleted.ideas = (await prisma.idea.deleteMany({})).count;
  // The knowledge side's rows in the life ledger go with the ideas they
  // record: reviews, new ideas, attestations, boss fights, the pre-ledger
  // streak days. Tasks and their XP are not knowledge and stay.
  if (scope !== "everything") {
    deleted.knowledgeEvents = (
      await prisma.activityEvent.deleteMany({ where: { userId, source: { in: KNOWLEDGE_SOURCES } } })
    ).count;
  }

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
    restDays,
    roadmapCounts,
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
    // M2: declared rest, sick and vacation days (the 'life' scope deletes them); 0 before life_duty is applied.
    countRestDays(userId),
    // Roadmap: 'life' and 'everything' delete every roadmap, 'ideas' and 'knowledge' archive the open one.
    countRoadmaps(userId),
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
    roadmaps: roadmapCounts.roadmaps,
    openRoadmaps: roadmapCounts.openRoadmaps,
    restDays,
  };
}
