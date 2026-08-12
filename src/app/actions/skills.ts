"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { getSkill } from "@/lib/skill-pool";
import {
  loadProgressionFresh,
  unlockBlockers,
  LOADOUT_SLOTS,
  type UnlockBlocker,
} from "@/lib/skill-effects";
import { getMasteryBalanceFresh, submitAttestation } from "@/lib/mastery";
import { invalidate } from "@/lib/cache";
import { ATTRIBUTE_META } from "@/lib/attributes";

export type SkillActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

function describeBlockers(blockers: UnlockBlocker[]): string {
  return blockers
    .map((b) => {
      switch (b.reason) {
        case "ALREADY_OWNED":
          return "Already unlocked.";
        case "PREREQUISITE":
          return `Requires ${b.missing} first.`;
        case "ATTRIBUTE":
          return `${ATTRIBUTE_META[b.attribute].label} ${b.have.toFixed(1)} / ${b.need.toFixed(1)} needed.`;
        case "BREADTH":
          return `Breadth: ${ATTRIBUTE_META[b.attribute].label} ${b.have.toFixed(1)} / ${b.need.toFixed(1)} needed.`;
        case "MASTERY":
          return `Needs ${b.need} mastery points (have ${b.have}).`;
      }
    })
    .join(" ");
}

/**
 * Spends mastery points to unlock a skill. Re-checks every blocker
 * server-side against a freshly loaded `ProgressionState` — the UI's own
 * blocker list is advisory, this is the enforcement.
 */
export async function unlockSkill(
  skillCode: string
): Promise<SkillActionResult<{ skillCode: string; masteryPaid: number }>> {
  const skill = getSkill(skillCode);
  if (!skill) {
    return { ok: false, error: "That skill does not exist." };
  }

  const userId = getCurrentUserId();
  // Both fresh: this spends points. Pricing a purchase off a cached balance
  // is exactly the kind of staleness that lets a player overspend.
  const [progression, masteryBalance] = await Promise.all([
    loadProgressionFresh(userId),
    getMasteryBalanceFresh(userId),
  ]);

  const blockers = unlockBlockers(
    skill,
    progression.scores,
    progression.ownedCodes,
    masteryBalance,
    progression.modifiers
  );
  if (blockers.length > 0) {
    return { ok: false, error: describeBlockers(blockers) };
  }

  try {
    await prisma.$transaction([
      prisma.masteryLedgerEntry.create({
        data: { userId, delta: -skill.masteryCost, reason: "SKILL_UNLOCK", detail: skill.code },
      }),
      prisma.unlockedSkill.create({
        data: { userId, skillCode: skill.code, masteryPaid: skill.masteryCost },
      }),
    ]);
  } catch {
    // @@unique([userId, skillCode]) race — the ALREADY_OWNED check above
    // raced with another unlock of the same skill between check and write.
    return { ok: false, error: "That skill was already unlocked." };
  }
  invalidate("progress");

  return { ok: true, value: { skillCode: skill.code, masteryPaid: skill.masteryCost } };
}

export async function submitMasteryAttestation(
  ideaId: string | null,
  text: string
): Promise<SkillActionResult<{ points: number; rationale: string }>> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Write something about what you now understand first." };
  }

  const userId = getCurrentUserId();
  const result = await submitAttestation(userId, ideaId, trimmed);

  if (result.status === "rate_limited") {
    return {
      ok: false,
      error: `Already graded one attestation today — next one available ${result.nextAvailableAt.toUTCString()}.`,
    };
  }

  return { ok: true, value: { points: result.points, rationale: result.rationale } };
}

// ============================================================================
// Loadout
// ============================================================================

/**
 * Equip a skill into a loadout slot, or bench it.
 *
 * Unlocking a skill no longer activates it — the ten slots do. Anything not
 * in a slot contributes nothing to `ActiveModifiers`, which is what stops a
 * long-lived account from simply holding all 749 effects at once.
 *
 * The write is a transaction because equipping is really two edits: vacate
 * whatever occupies the target slot, then move this skill in. Run
 * separately, a failure between them would leave the account either holding
 * a duplicate slot (violating the partial unique index) or silently missing
 * an effect it still believes it has.
 */
export async function equipSkill(
  skillCode: string,
  slot: number | null
): Promise<SkillActionResult<{ slot: number | null }>> {
  const userId = getCurrentUserId();

  const skill = getSkill(skillCode);
  if (!skill) {
    return { ok: false, error: "No such skill." };
  }
  if (slot !== null && (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS)) {
    return { ok: false, error: `Slot must be 0-${LOADOUT_SLOTS - 1}.` };
  }

  const owned = await prisma.unlockedSkill.findUnique({
    where: { userId_skillCode: { userId, skillCode } },
    select: { id: true },
  });
  if (!owned) {
    return { ok: false, error: "Unlock this skill before equipping it." };
  }

  await prisma.$transaction(async (tx) => {
    if (slot !== null) {
      // Bench whatever is already here. Equipping into an occupied slot
      // swaps rather than erroring — the bar is a place you rearrange.
      await tx.unlockedSkill.updateMany({
        where: { userId, equippedSlot: slot },
        data: { equippedSlot: null },
      });
    }
    await tx.unlockedSkill.update({
      where: { userId_skillCode: { userId, skillCode } },
      data: { equippedSlot: slot },
    });
  });

  invalidate("progress");
  return { ok: true, value: { slot } };
}

/** Clears a slot without needing to know what is in it. */
export async function clearSlot(slot: number): Promise<SkillActionResult<{ slot: number }>> {
  const userId = getCurrentUserId();
  if (!Number.isInteger(slot) || slot < 0 || slot >= LOADOUT_SLOTS) {
    return { ok: false, error: `Slot must be 0-${LOADOUT_SLOTS - 1}.` };
  }
  await prisma.unlockedSkill.updateMany({
    where: { userId, equippedSlot: slot },
    data: { equippedSlot: null },
  });
  invalidate("progress");
  return { ok: true, value: { slot } };
}
