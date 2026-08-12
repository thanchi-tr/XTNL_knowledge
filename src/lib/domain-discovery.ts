import { prisma } from "./prisma";
import { embedText, nameNewDomain } from "./gemini";
import { assignDomainComposition, fieldComposition } from "./attribute-assignment";
import { toVectorLiteral } from "./vector";
import { SIMILARITY_NOVELTY_MAX, SIMILARITY_SATURATION_MIN, SIMILARITY_N_SIMILAR_MIN } from "./xp";

interface NearestIdea {
  id: string;
  domainId: string;
  similarity: number;
}

export type RoutingResult =
  | { classification: "NOVELTY"; embedding: number[]; nSimilar: 0 }
  | { classification: "EXPANSION"; embedding: number[]; domainId: string; nSimilar: number }
  | { classification: "SATURATION"; embedding: number[]; domainId: string; matchedIdeaId: string; similarity: number };

/**
 * Nearest existing Idea to `embedding`, scoped to Domains under `fieldId`.
 * Cosine similarity via pgvector's `<=>` (cosine *distance*, 0..2) operator:
 * similarity = 1 - distance. Archived Ideas are excluded — they've already
 * served their taxonomy purpose and shouldn't gate new submissions.
 */
async function findNearestIdea(fieldId: string, embedding: number[]): Promise<NearestIdea | null> {
  const literal = toVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<NearestIdea[]>`
    SELECT i.id, i."domainId", 1 - (i.embedding <=> ${literal}::vector) AS similarity
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    WHERE d."fieldId" = ${fieldId}
      AND i.embedding IS NOT NULL
      AND i."isArchived" = false
    ORDER BY i.embedding <=> ${literal}::vector
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/**
 * N_similar for the XP decay formula: count of Ideas in `domainId` with
 * similarity >= 0.70 to `embedding` (spec section 4).
 */
export async function countSimilarInDomain(domainId: string, embedding: number[]): Promise<number> {
  const literal = toVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n
    FROM "Idea" i
    WHERE i."domainId" = ${domainId}
      AND i.embedding IS NOT NULL
      AND i."isArchived" = false
      AND (1 - (i.embedding <=> ${literal}::vector)) >= ${SIMILARITY_N_SIMILAR_MIN}
  `;
  return rows[0]?.n ?? 0;
}

/**
 * Routes a candidate Idea (spec section 3, "ML-Driven Domain Discovery &
 * Automated Taxonomy"):
 *   similarity > 0.85            -> SATURATION (reject; caller should offer "Link Idea")
 *   0.40 <= similarity <= 0.85   -> EXPANSION (assign to the matched Domain)
 *   similarity < 0.40            -> NOVELTY (new Domain needed)
 * A Field with no embedded Ideas yet has nothing to compare against and is
 * treated as NOVELTY by definition.
 */
export async function routeIdea(fieldId: string, contentText: string): Promise<RoutingResult> {
  const embedding = await embedText(contentText);
  const nearest = await findNearestIdea(fieldId, embedding);
  return routeFromNearest(embedding, nearest);
}

/**
 * The banding half of `routeIdea`, split out so callers that have already
 * embedded the candidate and run an ANN search don't pay for a second
 * Gemini round-trip. The dedup pipeline (dedup.ts) does exactly that: it
 * embeds once, classifies, and — when the verdict is CREATE_NEW_NODE —
 * hands the same vector here to pick the Domain.
 *
 * Reached from dedup only when similarity is already known to be at or
 * below the saturation line, so in that path the SATURATION branch is
 * unreachable; it still fires for direct `routeIdea` callers.
 */
export async function routeFromNearest(
  embedding: number[],
  nearest: NearestIdea | null
): Promise<RoutingResult> {
  if (!nearest) {
    return { classification: "NOVELTY", embedding, nSimilar: 0 };
  }

  if (nearest.similarity > SIMILARITY_SATURATION_MIN) {
    return {
      classification: "SATURATION",
      embedding,
      domainId: nearest.domainId,
      matchedIdeaId: nearest.id,
      similarity: nearest.similarity,
    };
  }

  if (nearest.similarity < SIMILARITY_NOVELTY_MAX) {
    return { classification: "NOVELTY", embedding, nSimilar: 0 };
  }

  const nSimilar = await countSimilarInDomain(nearest.domainId, embedding);
  return { classification: "EXPANSION", embedding, domainId: nearest.domainId, nSimilar };
}

/**
 * Novelty branch: create a new Domain under `fieldId`, named by a
 * lightweight LLM call (spec section 3).
 *
 * Reuses an existing same-named Domain instead of blindly inserting.
 * `nameNewDomain` is non-deterministic *and* anchored on the Field name,
 * so two unrelated Ideas under one Field can easily be handed the same
 * label — end-to-end testing produced two separate Domains both called
 * "Statistical Mechanics And Entropy", splitting one topic's points and
 * levels across duplicate rows.
 *
 * Deduplicating here rather than with a unique constraint on
 * (fieldId, name) is deliberate: a constraint would raise on collision and
 * fail the whole submission, losing what the user typed, whereas the worst
 * case here is an Idea filed under an existing Domain that fits it.
 */
export async function createNoveltyDomain(fieldId: string, fieldName: string, contentText: string) {
  const name = await nameNewDomain(fieldName, contentText);

  const existing = await prisma.domain.findFirst({
    where: { fieldId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    return existing;
  }

  const domain = await prisma.domain.create({ data: { name, fieldId } });

  // A discovered Domain gets the same attribution as a hand-created one.
  // Its name came from a model, but what that name *means* in attribute
  // terms is still decided by the deterministic lexicon — the model never
  // touches the substrate the skill gates read from.
  await assignDomainComposition(domain.id, name, await fieldComposition(fieldId));

  return domain;
}
