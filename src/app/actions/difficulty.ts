"use server";

import { prisma } from "@/lib/prisma";
import { invalidate } from "@/lib/cache";
import { estimateDifficulty, bandFor, type DifficultyBand } from "@/lib/difficulty";

/**
 * Scores every Idea whose difficulty has never been computed.
 *
 * Ideas written before the column existed default to 0, which is outside the
 * range the scorer produces for any real card — so "unscored" is
 * distinguishable from "trivial" rather than silently merged with it, and
 * this can be run repeatedly without touching rows that already have a score.
 *
 * Unlike `reattributeTaxonomy`, this is not a re-derivation of existing
 * values: difficulty is a fixed property of the question, so a card that has
 * already been scored has no reason to change. Passing `rescoreAll` forces it
 * anyway, which is only correct after the estimator itself changes.
 */

export interface DifficultyBackfillSummary {
  scored: number;
  skipped: number;
  byBand: Record<DifficultyBand, number>;
}

/** Batched so a large library cannot hold one transaction open across thousands of rows. */
const BATCH = 200;

export async function backfillDifficulty(rescoreAll = false): Promise<DifficultyBackfillSummary> {
  const summary: DifficultyBackfillSummary = {
    scored: 0,
    skipped: 0,
    byBand: { INTRO: 0, STANDARD: 0, DEMANDING: 0, SEVERE: 0 },
  };

  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.idea.findMany({
      where: rescoreAll ? {} : { difficulty: 0 },
      select: { id: true, questionType: true, question: true, answer: true, difficulty: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    const updates = [];
    for (const idea of batch) {
      const { score } = estimateDifficulty(idea.questionType, idea.question, idea.answer);
      if (score === idea.difficulty) {
        summary.skipped++;
        continue;
      }
      summary.byBand[bandFor(score)]++;
      summary.scored++;
      updates.push(prisma.idea.update({ where: { id: idea.id }, data: { difficulty: score } }));
    }
    if (updates.length > 0) await prisma.$transaction(updates);
  }

  if (summary.scored > 0) invalidate("ideas");
  return summary;
}
