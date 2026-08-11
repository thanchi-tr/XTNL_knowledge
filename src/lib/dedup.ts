import { prisma } from "./prisma";
import { embedText, synthesizeNodeData, synthesizeEnrichment, type SynthesizedNodeData } from "./gemini";
import { toVectorLiteral } from "./vector";
import { SIMILARITY_MERGE_MIN, SIMILARITY_SATURATION_MIN, SIMILARITY_N_SIMILAR_MIN } from "./xp";

/**
 * Memory-engineering deduplication.
 *
 * Layered on top of DomainDiscoveryService (domain-discovery.ts), which
 * answers a different question. Routing asks *which Domain does this Idea
 * file under* and creates an Idea in every branch. Dedup asks *should this
 * node exist at all* — and in two of its branches the answer is no, the
 * write goes to an existing row instead.
 *
 * Division of labour, and the reason this module is mostly arithmetic:
 * cosine distance decides the branch, the LLM only writes prose. A model
 * asked to emit its own `action` and `confidence_score` would be restating
 * a number pgvector already computed exactly, with the added failure mode
 * of contradicting it. So `action`, `target_node_id` and `confidence_score`
 * below are all derived from the vector search; Gemini is called only to
 * fill `node_data`, and only after the branch is settled.
 *
 * Field naming follows the deduplication contract rather than the
 * surrounding camelCase house style — this object is a documented wire
 * schema, consumed as-is by the Add form and logged verbatim for threshold
 * tuning.
 */

export type DedupAction = "MERGE_EXACT" | "SATURATION" | "CREATE_NEW_NODE";

export interface DedupNodeData {
  title: string;
  core_premise: string;
  atomic_prompt: string;
  enrichment_payload: string | null;
  tags: string[];
}

export interface DedupDecision {
  action: DedupAction;
  target_node_id: string | null;
  confidence_score: number;
  node_data: DedupNodeData | null;
  deduplication_reasoning: string;
}

/**
 * Maps synthesis output onto the contract's field names. Explicit rather
 * than a spread: spreading would leave the camelCase originals sitting on
 * an object whose whole purpose is to match a fixed wire schema.
 */
function toNodeData(node: SynthesizedNodeData): DedupNodeData {
  return {
    title: node.title,
    core_premise: node.corePremise,
    atomic_prompt: node.atomicPrompt,
    enrichment_payload: null,
    tags: node.tags,
  };
}

/** A neighbour returned by the ANN search, with the node fields dedup needs. */
export interface NeighbourNode {
  id: string;
  domainId: string;
  title: string | null;
  corePremise: string | null;
  tags: string[];
  similarity: number;
}

/**
 * Top-K nearest non-archived Ideas within a Field.
 *
 * Distinct from domain-discovery's `findNearestIdea` in both projection
 * (node fields, for synthesis) and arity (K, not 1). K matters here: at
 * LIMIT 1 a candidate sitting just under the merge line against its best
 * match is indistinguishable from one that is near-identical to three
 * separate nodes, and only the second case is a real duplicate cluster.
 * The extra rows are also what gets logged for threshold tuning.
 */
export async function findNearestNodes(
  fieldId: string,
  embedding: number[],
  limit = 5
): Promise<NeighbourNode[]> {
  const literal = toVectorLiteral(embedding);
  return prisma.$queryRaw<NeighbourNode[]>`
    SELECT i.id, i."domainId", i.title, i."corePremise", i.tags,
           1 - (i.embedding <=> ${literal}::vector) AS similarity
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    WHERE d."fieldId" = ${fieldId}
      AND i.embedding IS NOT NULL
      AND i."isArchived" = false
    ORDER BY i.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

export interface AnalysisResult {
  decision: DedupDecision;
  embedding: number[];
  neighbours: NeighbourNode[];
}

export interface CandidatePreview {
  /** The band this submission would land in, decided purely by cosine distance. */
  action: DedupAction;
  /** Similarity to the closest existing node, or null when the Field is empty. */
  topSimilarity: number | null;
  /** Nearest existing nodes, closest first — what the submission is competing with. */
  neighbours: { id: string; title: string | null; similarity: number }[];
  /** How many neighbours clear the N_similar line, which is what decays the payout. */
  nSimilar: number;
}

/**
 * A read-only look at what would happen, for the Add form's "check before
 * you commit" button.
 *
 * Deliberately *not* `analyzeCandidate`: that one calls the synthesis model
 * on the create-new-node path to write title/premise/tags, which is real
 * spend the user has not committed to yet and which nothing displays here.
 * The band itself is decided by cosine distance alone — see this module's
 * header — so a preview needs the embedding and the neighbour search, and
 * nothing else.
 */
export async function previewCandidate(fieldId: string, contentText: string): Promise<CandidatePreview> {
  const embedding = await embedText(contentText);
  const neighbours = await findNearestNodes(fieldId, embedding);
  const nearest = neighbours[0];

  const action: DedupAction = !nearest
    ? "CREATE_NEW_NODE"
    : nearest.similarity >= SIMILARITY_MERGE_MIN
      ? "MERGE_EXACT"
      : nearest.similarity > SIMILARITY_SATURATION_MIN
        ? "SATURATION"
        : "CREATE_NEW_NODE";

  return {
    action,
    topSimilarity: nearest?.similarity ?? null,
    neighbours: neighbours.slice(0, 3).map((n) => ({ id: n.id, title: n.title, similarity: n.similarity })),
    nSimilar: neighbours.filter((n) => n.similarity >= SIMILARITY_N_SIMILAR_MIN).length,
  };
}

/**
 * Classifies a candidate against what the Field already contains.
 *
 * Performs no writes — `submitIdea` owns those. Kept side-effect-free so
 * the Add form can call it for a live preview of what will happen before
 * the user commits.
 *
 * `mergeThreshold` defaults to `SIMILARITY_MERGE_MIN` and is the
 * DEDUP_PRECISION skill hook (`ActiveModifiers.dedupThresholdDelta` added
 * on top by the caller) — raising it means fewer submissions get silently
 * auto-merged, at the cost of demanding a near-exact match before that
 * mercy kicks in.
 */
export async function analyzeCandidate(
  fieldId: string,
  fieldName: string,
  contentText: string,
  mergeThreshold = SIMILARITY_MERGE_MIN
): Promise<AnalysisResult> {
  const embedding = await embedText(contentText);
  const neighbours = await findNearestNodes(fieldId, embedding);
  const nearest = neighbours[0];

  // An empty Field has nothing to duplicate against.
  if (!nearest) {
    const node = await synthesizeNodeData(fieldName, contentText);
    return {
      embedding,
      neighbours,
      decision: {
        action: "CREATE_NEW_NODE",
        target_node_id: null,
        confidence_score: 1,
        node_data: toNodeData(node),
        deduplication_reasoning: "Field contains no embedded Ideas; nothing to compare against.",
      },
    };
  }

  if (nearest.similarity >= mergeThreshold) {
    // No synthesis call: nothing is being written that needs prose, and the
    // existing node's own wording is what survives a merge.
    return {
      embedding,
      neighbours,
      decision: {
        action: "MERGE_EXACT",
        target_node_id: nearest.id,
        confidence_score: nearest.similarity,
        node_data: null,
        deduplication_reasoning:
          `Cosine similarity ${nearest.similarity.toFixed(4)} >= ${mergeThreshold.toFixed(4)} against ` +
          `"${nearest.title ?? nearest.id}". Semantically identical; new node creation aborted.`,
      },
    };
  }

  if (nearest.similarity > SIMILARITY_SATURATION_MIN) {
    return {
      embedding,
      neighbours,
      decision: {
        action: "SATURATION",
        target_node_id: nearest.id,
        confidence_score: nearest.similarity,
        node_data: null,
        deduplication_reasoning:
          `Cosine similarity ${nearest.similarity.toFixed(4)} falls between ${SIMILARITY_SATURATION_MIN} and ` +
          `${mergeThreshold.toFixed(4)} against "${nearest.title ?? nearest.id}". Too close to stand alone, too ` +
          `distinct to discard — user resolves by linking or enriching.`,
      },
    };
  }

  const node = await synthesizeNodeData(fieldName, contentText);
  return {
    embedding,
    neighbours,
    decision: {
      action: "CREATE_NEW_NODE",
      target_node_id: null,
      confidence_score: 1 - nearest.similarity,
      node_data: toNodeData(node),
      deduplication_reasoning:
        `Nearest match "${nearest.title ?? nearest.id}" at ${nearest.similarity.toFixed(4)}, below the ` +
        `${SIMILARITY_SATURATION_MIN} saturation line. Distinct standalone premise.`,
    },
  };
}

/**
 * MERGE_EXACT execution: "Abort new node creation. Assign the existing
 * node's target_node_id. Combine any unique metadata or tags."
 *
 * The candidate's own tags are not available — synthesis is skipped on this
 * path — so the metadata actually combined is the tag set the *caller*
 * supplies (from an explicit user-tagged submission) plus an endorsement,
 * on the reasoning that independently re-encountering an idea is evidence
 * it matters. Returns the surviving node's id.
 */
export async function mergeIntoNode(targetNodeId: string, candidateTags: string[] = []): Promise<string> {
  const target = await prisma.idea.findUniqueOrThrow({
    where: { id: targetNodeId },
    select: { id: true, tags: true },
  });

  const merged = Array.from(new Set([...target.tags, ...candidateTags]));

  await prisma.idea.update({
    where: { id: target.id },
    data: {
      tags: merged,
      endorsements: { increment: 1 },
    },
  });

  return target.id;
}

export interface EnrichResult {
  status: "enriched" | "no_new_information";
  targetNodeId: string;
  payload: string | null;
}

/**
 * ENRICH_EXISTING execution. Appends to the target as an IdeaEnrichment row
 * rather than rewriting `corePremise`, so the original wording survives and
 * the merge is auditable — see the model's doc comment in schema.prisma.
 *
 * Creates no Idea and moves no points: enrichment is explicitly not a new
 * node, so awarding XP for it would make re-submitting paraphrases a
 * scoring exploit.
 */
export async function enrichNode(
  targetNodeId: string,
  candidateText: string,
  similarity: number
): Promise<EnrichResult> {
  const target = await prisma.idea.findUniqueOrThrow({
    where: { id: targetNodeId },
    select: { id: true, corePremise: true, question: true },
  });

  // Ideas predating the dedup pipeline have no corePremise; their question
  // text is the best available stand-in for what the node already asserts.
  const existingPremise = target.corePremise ?? target.question;
  const payload = await synthesizeEnrichment(existingPremise, candidateText);

  if (!payload) {
    return { status: "no_new_information", targetNodeId: target.id, payload: null };
  }

  await prisma.ideaEnrichment.create({
    data: { ideaId: target.id, payload, sourceText: candidateText, similarity },
  });

  return { status: "enriched", targetNodeId: target.id, payload };
}
