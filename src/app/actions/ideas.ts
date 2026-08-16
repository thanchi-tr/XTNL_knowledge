"use server";

import { after } from "next/server";
import type { CollectionLabel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedText, synthesizeNodeData, generateDistractors } from "@/lib/gemini";
import { routeFromNearest, createNoveltyDomain, countSimilarInDomain } from "@/lib/domain-discovery";
import { pickField, type FieldChoice } from "@/lib/field-routing";
import {
  analyzeCandidate,
  previewCandidate,
  mergeIntoNode,
  enrichNode,
  type CandidatePreview,
  type DedupDecision,
  type EnrichResult,
} from "@/lib/dedup";
import { encodeIdeaContent, type IdeaContent } from "@/lib/idea-payload";
import { estimateDifficulty } from "@/lib/difficulty";
import { embeddingTextFromStored } from "@/lib/embedding-text";
import { toVectorLiteral } from "@/lib/vector";
import { XP_BASE, yieldXp, graceEndsAt, SIMILARITY_MERGE_MIN } from "@/lib/xp";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadModifiers, loadProgression } from "@/lib/skill-effects";
import { assignIdeaAttribution } from "@/lib/attribute-assignment";
import { getCurrentUserId } from "@/lib/user";
import { recalculateLeveling } from "@/lib/leveling";
import { invalidate } from "@/lib/cache";

/** Same discriminated-result shape the taxonomy and skill actions use. */
export type SkillFreeResult<T> = { ok: true; value: T } | { ok: false; error: string };

export interface SubmitIdeaInput {
  /**
   * Omit to have the Field chosen automatically — see `field-routing.ts`.
   *
   * Domains have been discovered automatically since the beginning; the Field
   * was the one structural decision still forced on the user, and the one
   * they were least able to make quickly before having written the idea down.
   */
  fieldId?: string;
  collectionLabel: CollectionLabel;
  content: IdeaContent;
  /**
   * Bypasses Domain discovery and files the Idea here directly.
   *
   * Without this, a hand-created Domain is unreachable: routing picks a
   * Domain by finding the nearest existing *Idea* and taking its Domain, so
   * an empty Domain has nothing to match against and can never receive its
   * first Idea. Manual placement is the escape hatch — and it is the whole
   * point of being able to create a Domain by hand.
   *
   * Deduplication still runs. Where a node goes and whether it should exist
   * are independent questions.
   */
  domainId?: string;
}

export type SubmitIdeaResult =
  | {
      status: "created";
      ideaId: string;
      domainId: string;
      classification: "NOVELTY" | "EXPANSION" | "MANUAL";
      decision: DedupDecision;
      /**
       * Present only when the Field was chosen automatically, so the UI can
       * say where the idea landed and on what evidence. A `WEAK` basis means
       * nothing fitted well and the user should be offered a new Field.
       */
      routedField?: FieldChoice;
    }
  | { status: "merged"; targetIdeaId: string; similarity: number; decision: DedupDecision }
  | {
      status: "saturated";
      matchedIdeaId: string;
      domainId: string;
      similarity: number;
      decision: DedupDecision;
    };

/**
 * Server-authoritative Idea creation.
 *
 * Two classifiers run here, in order, and they are not the same thing:
 *
 *   1. Deduplication (dedup.ts) — should this node exist at all? A
 *      near-identical match is folded into the existing Idea and no row is
 *      created. This embeds the candidate.
 *   2. Domain routing (domain-discovery.ts) — given that it should exist,
 *      which Domain does it belong to? Reuses the embedding from step 1
 *      via `routeFromNearest`, so a submission costs one embedding call
 *      regardless of which branch it takes.
 *
 * The SATURATION band still returns without writing, exactly as before, so
 * the client can offer "Link Idea" — now alongside "Enrich", which merges
 * the candidate into the match instead of creating a sibling.
 */
export async function submitIdea(input: SubmitIdeaInput): Promise<SubmitIdeaResult> {
  const { question, answer, questionType } = encodeIdeaContent(input.content);
  const contentText = embeddingTextFromStored(questionType, question, answer);

  const userId = getCurrentUserId();
  // Progression rather than modifiers alone: the daily focus draw is skewed
  // by which rare emblems are actually equipped, so it needs the loadout.
  const progression = await loadProgression(userId);
  const modifiers = progression.modifiers;

  /**
   * The Field is chosen automatically when the caller does not name one.
   *
   * The embedding is computed here and handed to `analyzeCandidate` rather
   * than letting it embed again — routing and deduplication ask different
   * questions of the same vector, and embedding is the only external API
   * call on the write path.
   */
  let fieldId = input.fieldId;
  let precomputed: number[] | undefined;
  let routedField: FieldChoice | null = null;
  if (!fieldId) {
    precomputed = await embedText(contentText);
    routedField = await pickField(precomputed, contentText);
    if (!routedField) {
      // Only reachable with zero Fields in the account. Thrown rather than
      // returned because the result union describes where an Idea *went*,
      // and there is no answer to give — the same treatment the other
      // impossible-precondition paths here already get.
      throw new Error("Create a Field before adding ideas — there is nowhere to file this yet.");
    }
    fieldId = routedField.fieldId;
  }

  const field = await prisma.field.findUniqueOrThrow({ where: { id: fieldId } });
  const mergeThreshold = SIMILARITY_MERGE_MIN + modifiers.dedupThresholdDelta;
  const { decision, embedding, neighbours } = await analyzeCandidate(
    fieldId,
    field.name,
    contentText,
    mergeThreshold,
    precomputed
  );

  if (decision.action === "MERGE_EXACT" && decision.target_node_id) {
    await mergeIntoNode(decision.target_node_id, decision.node_data?.tags ?? []);
    return {
      status: "merged",
      targetIdeaId: decision.target_node_id,
      similarity: decision.confidence_score,
      decision,
    };
  }

  const nearest = neighbours[0] ?? null;

  if (decision.action === "SATURATION" && decision.target_node_id && nearest) {
    return {
      status: "saturated",
      matchedIdeaId: decision.target_node_id,
      domainId: nearest.domainId,
      similarity: decision.confidence_score,
      decision,
    };
  }

  // Explicit placement short-circuits routing entirely.
  let domain;
  let classification: "NOVELTY" | "EXPANSION" | "MANUAL";
  let nSimilar: number;

  if (input.domainId) {
    domain = await prisma.domain.findFirstOrThrow({
      where: { id: input.domainId, fieldId },
    });
    classification = "MANUAL";
    nSimilar = await countSimilarInDomain(domain.id, embedding);
  } else {
    const routing = await routeFromNearest(embedding, nearest);

    // Unreachable: dedup returns above for anything past the saturation line.
    // Narrowing the union rather than casting keeps that guarantee checked.
    if (routing.classification === "SATURATION") {
      return {
        status: "saturated",
        matchedIdeaId: routing.matchedIdeaId,
        domainId: routing.domainId,
        similarity: routing.similarity,
        decision,
      };
    }

    domain =
      routing.classification === "NOVELTY"
        ? await createNoveltyDomain(fieldId, field.name, contentText)
        : await prisma.domain.findUniqueOrThrow({ where: { id: routing.domainId } });
    classification = routing.classification;
    nSimilar = routing.nSimilar;
  }

  const base = XP_BASE[questionType];
  // The daily focus Field pays more for new Ideas. Applied to the *yield*
  // rather than the base so it compounds with the decay and floor the rest
  // of the curve already applies, instead of quietly bypassing them.
  const focus = await loadDailyFocus(userId, progression.activeSkills);
  const focusMultiplier = focus && focus.fieldId === fieldId ? focus.multiplier : 1;
  const yieldPoints =
    yieldXp(base, nSimilar, modifiers.lambda, modifiers.yieldFloorFraction) * focusMultiplier;
  const dueDate = new Date();
  const level = 1;

  const idea = await prisma.idea.create({
    data: {
      domainId: domain.id,
      collectionLabel: input.collectionLabel,
      level,
      basePoints: base,
      yieldPoints,
      question,
      questionType,
      answer,
      dueDate,
      graceEndsAt: graceEndsAt(dueDate, level, modifiers.graceExtraDays),
      // Scored from the stored form, so the same function serves creation and
      // backfill and neither can drift from the other.
      difficulty: estimateDifficulty(questionType, question, answer).score,
      title: decision.node_data?.title,
      corePremise: decision.node_data?.core_premise,
      atomicPrompt: decision.node_data?.atomic_prompt,
      tags: decision.node_data?.tags ?? [],
    },
  });

  // Prisma Client has no typed API for Unsupported("vector(1536)") columns —
  // the embedding computed during routing gets written with a raw UPDATE.
  const literal = toVectorLiteral(embedding);
  await prisma.$executeRaw`UPDATE "Idea" SET embedding = ${literal}::vector WHERE id = ${idea.id}`;

  await prisma.domain.update({
    where: { id: domain.id },
    data: { totalPoints: { increment: yieldPoints } },
  });
  await recalculateLeveling(domain.id);

  // Attribution is derived data: it must never be able to lose a submission
  // the user actually typed, and nothing in the response depends on it. So
  // it runs after the response, outside the write path above.
  after(async () => {
    await assignIdeaAttribution(idea.id, domain.id, contentText, questionType);
  });

  return {
    status: "created",
    ideaId: idea.id,
    domainId: domain.id,
    classification,
    decision,
    ...(routedField ? { routedField } : {}),
  };
}

export interface PreviewIdeaInput {
  fieldId: string;
  content: IdeaContent;
}

export interface PreviewIdeaResult extends CandidatePreview {
  /** Base points for this question type, before saturation decay. */
  basePoints: number;
  /** What the submission would actually be worth given the neighbours found. */
  projectedPoints: number;
}

/**
 * Read-only "what would happen if I submitted this".
 *
 * Writes nothing and creates no Idea — it exists so a near-duplicate can be
 * discovered *before* the user commits, rather than being told after the
 * fact that their submission was folded into something else. Costs one
 * embedding call; no synthesis (see `previewCandidate`).
 */
export async function previewIdea(input: PreviewIdeaInput): Promise<PreviewIdeaResult> {
  const { question, answer, questionType } = encodeIdeaContent(input.content);
  const contentText = embeddingTextFromStored(questionType, question, answer);

  const userId = getCurrentUserId();
  const [preview, modifiers] = await Promise.all([
    previewCandidate(input.fieldId, contentText),
    loadModifiers(userId),
  ]);

  const basePoints = XP_BASE[questionType];
  return {
    ...preview,
    basePoints,
    projectedPoints: yieldXp(basePoints, preview.nSimilar, modifiers.lambda, modifiers.yieldFloorFraction),
  };
}

export interface EnrichIdeaInput {
  targetIdeaId: string;
  content: IdeaContent;
  similarity: number;
}

/**
 * Resolves a SATURATION verdict the other way from `linkIdea`: instead of
 * creating a sibling Idea with a graph edge, fold the candidate's new
 * detail into the matched node as an IdeaEnrichment.
 *
 * Creates no Idea and awards no XP — see `enrichNode`. `linkIdea` remains
 * the path that does both, so the choice between them is a real one:
 * link when the candidate is its own idea that merely resembles another,
 * enrich when it is more detail about the same idea.
 */
export async function enrichIdea(input: EnrichIdeaInput): Promise<EnrichResult> {
  const { question, answer, questionType } = encodeIdeaContent(input.content);
  const contentText = embeddingTextFromStored(questionType, question, answer);
  return enrichNode(input.targetIdeaId, contentText, input.similarity);
}

export interface LinkIdeaInput {
  content: IdeaContent;
  collectionLabel: CollectionLabel;
  existingIdeaId: string;
}

export interface LinkIdeaResult {
  ideaId: string;
  domainId: string;
}

/**
 * Spec section 1 ("Real-Time ML UI/UX & Domain Discovery"): "Linking:
 * Clicking 'Link Idea' appends the existing Idea's ID to the new entry's
 * linkedIdeaIds, building a knowledge graph." This is how a SATURATION
 * result from submitIdea gets resolved instead of being dropped outright —
 * the new Idea still gets created, in the same Domain as its match, with
 * linkedIdeaIds recording the connection.
 */
export async function linkIdea(input: LinkIdeaInput): Promise<LinkIdeaResult> {
  const existing = await prisma.idea.findUniqueOrThrow({ where: { id: input.existingIdeaId } });
  const domain = await prisma.domain.findUniqueOrThrow({
    where: { id: existing.domainId },
    include: { field: { select: { name: true } } },
  });
  const { question, answer, questionType } = encodeIdeaContent(input.content);
  const contentText = embeddingTextFromStored(questionType, question, answer);

  // A linked Idea is still a node in its own right — it gets the same
  // node data as one created through submitIdea, or it would be invisible
  // to title/tag search and unusable as a dedup target later.
  const userId = getCurrentUserId();
  const [embedding, node, modifiers] = await Promise.all([
    embedText(contentText),
    synthesizeNodeData(domain.field.name, contentText),
    loadModifiers(userId),
  ]);
  const base = XP_BASE[questionType];
  const nSimilar = await countSimilarInDomain(existing.domainId, embedding);
  const yieldPoints = yieldXp(base, nSimilar, modifiers.lambda, modifiers.yieldFloorFraction);
  const dueDate = new Date();
  const level = 1;

  const idea = await prisma.idea.create({
    data: {
      domainId: existing.domainId,
      collectionLabel: input.collectionLabel,
      level,
      basePoints: base,
      yieldPoints,
      question,
      questionType,
      answer,
      dueDate,
      graceEndsAt: graceEndsAt(dueDate, level, modifiers.graceExtraDays),
      linkedIdeaIds: [existing.id],
      title: node.title,
      corePremise: node.corePremise,
      atomicPrompt: node.atomicPrompt,
      tags: node.tags,
    },
  });

  const literal = toVectorLiteral(embedding);
  await prisma.$executeRaw`UPDATE "Idea" SET embedding = ${literal}::vector WHERE id = ${idea.id}`;

  await prisma.domain.update({
    where: { id: existing.domainId },
    data: { totalPoints: { increment: yieldPoints } },
  });
  await recalculateLeveling(existing.domainId);

  // A linked Idea is a node in its own right, so it earns the same
  // attribution as one created through submitIdea.
  after(async () => {
    await assignIdeaAttribution(idea.id, existing.domainId, contentText, questionType);
  });

  return { ideaId: idea.id, domainId: existing.domainId };
}

// ============================================================================
// Deletion
// ============================================================================

export interface DeleteIdeaResult {
  ideaId: string;
  domainId: string;
  /** Points removed from the Domain — the Idea's own yield contribution. */
  pointsRemoved: number;
  /** Domain level after recalculation. */
  domainLevel: number;
}

/**
 * Permanently removes one Idea.
 *
 * Distinct from archiving, which the schema already supports: an archived
 * Idea still exists, still holds its points and still counts as a
 * deduplication neighbour. This is for material that should never have been
 * captured at all.
 *
 * **Points.** A Domain's `totalPoints` is the sum of every Idea's
 * `yieldPoints` plus the review rewards earned since. Deleting an Idea
 * reverses only its own yield contribution, not the rewards — those were
 * paid for recall that genuinely happened, and confiscating them would
 * punish the user for tidying up. Floored at zero, because
 * `DEGRADATION_YIELD_MULTIPLIER` can have shrunk an Idea's yield below what
 * it originally contributed.
 *
 * `IdeaEnrichment` rows cascade with the Idea (see schema.prisma).
 */
export async function deleteIdea(ideaId: string): Promise<SkillFreeResult<DeleteIdeaResult>> {
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { id: true, domainId: true, yieldPoints: true },
  });
  if (!idea) {
    return { ok: false, error: "That idea no longer exists." };
  }

  const domain = await prisma.domain.findUniqueOrThrow({
    where: { id: idea.domainId },
    select: { totalPoints: true },
  });
  const pointsRemoved = Math.min(idea.yieldPoints, domain.totalPoints);

  await prisma.$transaction([
    prisma.idea.delete({ where: { id: ideaId } }),
    prisma.domain.update({
      where: { id: idea.domainId },
      data: { totalPoints: { decrement: pointsRemoved } },
    }),
  ]);

  const { domainLevel } = await recalculateLeveling(idea.domainId);

  // Both tags: the Idea is gone from every listing, and the Domain's points
  // and level moved, which the progression reads.
  invalidate("ideas", "fields", "progress");

  return { ok: true, value: { ideaId, domainId: idea.domainId, pointsRemoved, domainLevel } };
}

export interface DistractorsInput {
  correctAnswer: string;
  fieldName?: string;
  prompt?: string;
}

export type DistractorsResult =
  | { ok: true; distractors: string[] }
  | { ok: false; error: string };

/**
 * Three wrong options for a MULTI card, from the right one.
 *
 * Authoring is where multiple choice is usually lost: the author knows the
 * answer, so they cannot see that their three wrong options are obviously
 * wrong, and the card quietly becomes a reading test. Generating them is the
 * one part of capture where a model is straightforwardly better than the
 * person — it does not know which one is supposed to be right.
 *
 * Advisory, never authoritative. The result lands in editable fields, so
 * every word can be changed or thrown away before anything is written. That
 * is what makes it safe to use a model here at all: nothing it produces
 * reaches the database without passing under the author's eye first.
 */
export async function suggestDistractors(input: DistractorsInput): Promise<DistractorsResult> {
  const answer = input.correctAnswer.trim();
  if (!answer) return { ok: false, error: "Enter the correct answer first." };

  try {
    const distractors = await generateDistractors(answer, {
      fieldName: input.fieldName,
      prompt: input.prompt,
    });
    if (distractors.length === 0) {
      return { ok: false, error: "No usable options came back — try rewording the answer." };
    }
    return { ok: true, distractors };
  } catch (err) {
    // Surfaced rather than thrown: this is an optional assist on a form the
    // author can complete by hand, so a missing API key or a cold model
    // should degrade to a message beside the button, not a broken page.
    return { ok: false, error: err instanceof Error ? err.message : "Could not generate options." };
  }
}
