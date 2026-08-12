"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { invalidateAll } from "@/lib/cache";
import { domainLevel, fieldLevel } from "@/lib/xp";

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

export type ResetScope = "ideas" | "knowledge" | "everything";

export interface ResetSummary {
  scope: ResetScope;
  deleted: Record<string, number>;
  /** Rows left alone, so the report says what survived as well as what did not. */
  preserved: Record<string, number>;
}

export type ResetResult = { ok: true; value: ResetSummary } | { ok: false; error: string };

export const RESET_SCOPES: Record<ResetScope, { label: string; phrase: string; blurb: string }> = {
  ideas: {
    label: "Ideas only",
    phrase: "DELETE IDEAS",
    blurb:
      "Removes every idea and its enrichments, and zeroes each domain's points and level. Fields and domains stay, so the structure you built is still there to file into.",
  },
  knowledge: {
    label: "Ideas, domains and fields",
    phrase: "DELETE KNOWLEDGE",
    blurb:
      "The above, plus the whole taxonomy and its attribute compositions, snapshots and streaks. Skills, mastery points and titles survive.",
  },
  everything: {
    label: "Everything, including progression",
    phrase: "DELETE EVERYTHING",
    blurb:
      "A completely new account: the taxonomy, every idea, and all progression — unlocked skills, the mastery ledger, boss encounters, boons and debuffs.",
  },
};

/**
 * Wipes part of this knowledge base.
 *
 * `confirmation` must equal the scope's phrase exactly.
 */
export async function resetKnowledgeBase(scope: ResetScope, confirmation: string): Promise<ResetResult> {
  const spec = RESET_SCOPES[scope];
  if (!spec) {
    return { ok: false, error: "Unknown reset scope." };
  }
  if (confirmation.trim() !== spec.phrase) {
    return { ok: false, error: `Type ${spec.phrase} exactly to confirm.` };
  }

  const userId = getCurrentUserId();
  const deleted: Record<string, number> = {};

  // ── Ideas, always ───────────────────────────────────────────────────
  // IdeaEnrichment cascades from Idea, so it is counted before the delete
  // rather than deleted separately.
  deleted.enrichments = await prisma.ideaEnrichment.count();
  deleted.ideas = (await prisma.idea.deleteMany({})).count;

  if (scope === "ideas") {
    // Points and levels are derived from Ideas, so with none left they must
    // return to what a brand-new domain looks like — otherwise a wiped
    // account keeps levels it can no longer justify.
    const zeroLevel = domainLevel(0);
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

  invalidateAll();
  return { ok: true, value: { scope, deleted, preserved: {} } };
}

/** Row counts, so the danger zone can state exactly what is at stake. */
export async function getResetPreview(): Promise<Record<string, number>> {
  const [ideas, enrichments, domains, fields, snapshots, unlockedSkills, masteryEntries] = await Promise.all([
    prisma.idea.count(),
    prisma.ideaEnrichment.count(),
    prisma.domain.count(),
    prisma.field.count(),
    prisma.fieldSnapshot.count(),
    prisma.unlockedSkill.count(),
    prisma.masteryLedgerEntry.count(),
  ]);
  return { ideas, enrichments, domains, fields, snapshots, unlockedSkills, masteryEntries };
}
