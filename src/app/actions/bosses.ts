"use server";

import type { QuestionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { displayQuestion } from "@/lib/idea-display";
import { beginBossAttempt, resolveBossAttempt, type BossResolution } from "@/lib/bosses";

export type BossActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** One drawn card, shaped exactly like the Workspace session runner already expects. */
export interface BossCard {
  id: string;
  level: number;
  questionType: QuestionType;
  question: string;
  preview: string;
  domainName: string;
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
    select: {
      id: true,
      level: true,
      questionType: true,
      question: true,
      domain: { select: { name: true } },
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
      domainName: i.domain.name,
    }));

  return { ok: true, value: { fieldId, tier: begun.tier, cards } };
}

export async function resolveBossEncounter(
  fieldId: string,
  correct: number,
  total: number
): Promise<BossActionResult<BossResolution>> {
  const userId = getCurrentUserId();
  const resolution = await resolveBossAttempt(userId, fieldId, correct, total);
  if (resolution.outcome === "rejected") {
    return { ok: false, error: resolution.why };
  }
  return { ok: true, value: resolution };
}
