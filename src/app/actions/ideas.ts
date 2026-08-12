"use server";

import { after } from "next/server";
import type { CollectionLabel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedText, synthesizeNodeData } from "@/lib/gemini";
import { routeFromNearest, createNoveltyDomain, countSimilarInDomain } from "@/lib/domain-discovery";
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
import { embeddingTextFromStored } from "@/lib/embedding-text";
import { toVectorLiteral } from "@/lib/vector";
import { XP_BASE, yieldXp, graceEndsAt, SIMILARITY_MERGE_MIN } from "@/lib/xp";
import { loadModifiers } from "@/lib/skill-effects";
import { assignIdeaAttribution } from "@/lib/attribute-assignment";
import { getCurrentUserId } from "@/lib/user";
import { recalculateLeveling } from "@/lib/leveling";

export interface SubmitIdeaInput {
  fieldId: string;
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
  const [field, modifiers] = await Promise.all([
    prisma.field.findUniqueOrThrow({ where: { id: input.fieldId } }),
    loadModifiers(userId),
  ]);
  const mergeThreshold = SIMILARITY_MERGE_MIN + modifiers.dedupThresholdDelta;
  const { decision, embedding, neighbours } = await analyzeCandidate(input.fieldId, field.name, contentText, mergeThreshold);

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
      where: { id: input.domainId, fieldId: input.fieldId },
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
        ? await createNoveltyDomain(input.fieldId, field.name, contentText)
        : await prisma.domain.findUniqueOrThrow({ where: { id: routing.domainId } });
    classification = routing.classification;
    nSimilar = routing.nSimilar;
  }

  const base = XP_BASE[questionType];
  const yieldPoints = yieldXp(base, nSimilar, modifiers.lambda, modifiers.yieldFloorFraction);
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
