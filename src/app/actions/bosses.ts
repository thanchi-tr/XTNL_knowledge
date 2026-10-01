"use server";

import type { QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { displayQuestion } from "@/lib/idea-display";
import { beginBossAttempt, claimBossBoon, resolveBossAttempt, type BossResolution } from "@/lib/bosses";
import type { ActiveBoonRow, BoonKind } from "@/lib/boon-meta";
import { captureSnapshot, detectCelebrations } from "@/lib/celebrations";
import type { CelebrationEvent } from "@/lib/celebration-types";

export type BossActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** One drawn card, shaped exactly like the review runner's queue entries. */
export interface BossCard {
  id: string;
  level: number;
  questionType: QuestionType;
  question: string;
  preview: string;
  /** A MULTI card's retrieval question (Idea.atomicPrompt), when it has one. Never the answer. */
  prompt: string | null;
  domainName: string;
  fieldName: string;
}

export interface BossEncounterPayload {
  fieldId: string;
  tier: number;
  cards: BossCard[];
}

/**
 * Opens an encounter and returns its drawn cards.
 *
 * Like every other surface in this app, the payload carries `question` but
 * never `answer` — a Boss fight is still a review, and leaking the answer
 * into the RSC payload would defeat the entire encounter.
 */
export async function startBossEncounter(fieldId: string): Promise<BossActionResult<BossEncounterPayload>> {
  const userId = getCurrentUserId();
  const begun = await beginBossAttempt(userId, fieldId);
  if (!begun.ok) return { ok: false, error: begun.error };

  const ideas = await prisma.idea.findMany({
    where: { id: { in: begun.cards.map((c) => c.id) } },
    relationLoadStrategy: "join",
    select: {
      id: true,
      level: true,
      questionType: true,
      question: true,
      atomicPrompt: true,
      domain: { select: { name: true, field: { select: { name: true } } } },
    },
  });

  // Preserve the weighted draw order rather than the database's.
  const byId = new Map(ideas.map((i) => [i.id, i]));
  const cards: BossCard[] = begun.cards
    .map((c) => byId.get(c.id))
    .filter((i): i is NonNullable<typeof i> => i !== undefined)
    .map((i) => ({
      id: i.id,
      level: i.level,
      questionType: i.questionType,
      question: i.question,
      preview: displayQuestion(i.questionType, i.question),
      prompt: i.questionType === "MULTI" ? i.atomicPrompt?.trim() || null : null,
      domainName: i.domain.name,
      fieldName: i.domain.field.name,
    }));

  return { ok: true, value: { fieldId, tier: begun.tier, cards } };
}

export async function resolveBossEncounter(
  fieldId: string,
  correct: number,
  total: number
): Promise<BossActionResult<{ resolution: BossResolution; celebrations: CelebrationEvent[] }>> {
  const userId = getCurrentUserId();
  // Scoped (levels, mastered, streak, bosses), the same scope before and after.
  const before = await captureSnapshot(userId, { scope: "boss" }).catch(() => null);
  const resolution = await resolveBossAttempt(userId, fieldId, correct, total);
  if (resolution.outcome === "rejected") {
    return { ok: false, error: resolution.why };
  }
  // L3's detectors see the victory (a T2 "boss-won" Seal). Never fails the resolution.
  const celebrations: CelebrationEvent[] = before
    ? await captureSnapshot(userId, { scope: "boss" })
        .then((after) => detectCelebrations(before, after, { cause: "boss" }))
        .catch(() => [])
    : [];
  return { ok: true, value: { resolution, celebrations } };
}

/** Grants the boon the player chose for their latest victory over this field's Boss (once per victory). */
export async function chooseBossBoon(fieldId: string, kind: BoonKind): Promise<BossActionResult<ActiveBoonRow>> {
  const userId = getCurrentUserId();
  const res = await claimBossBoon(userId, fieldId, kind);
  return res.ok ? { ok: true, value: res.boon } : { ok: false, error: res.error };
}
