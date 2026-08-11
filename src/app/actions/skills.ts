"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { getSkill } from "@/lib/skill-pool";
import { loadProgression, unlockBlockers, type UnlockBlocker } from "@/lib/skill-effects";
import { getMasteryBalance, submitAttestation } from "@/lib/mastery";
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
  const [progression, masteryBalance] = await Promise.all([loadProgression(userId), getMasteryBalance(userId)]);

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
