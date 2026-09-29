import type { QuestionType } from "@prisma/client";
import { prisma } from "./prisma";
import { embedText, synthesizeNodeData, synthesizeEnrichment, type SynthesizedNodeData } from "./gemini";
import { toVectorLiteral } from "./vector";
import { SIMILARITY_MERGE_MIN, SIMILARITY_SATURATION_MIN, SIMILARITY_N_SIMILAR_MIN, SIMILARITY_NOVELTY_MAX } from "./xp";
import { cardTextFromStored, judge, type CardText, type Neighbour, type NoveltyVerdict, type Relation } from "./novelty";

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
 * the vector search and a lexical reading decide the branch, the LLM only
 * writes prose. Cosine distance says how close two cards are in meaning;
 * novelty.ts reads both cards to say *how* they differ — a changed figure,
 * an inserted "not", a different answer to the same question, the same
 * template about another subject — which cosine cannot see and which call
 * for opposite outcomes. A model asked to emit its own `action` and
 * `confidence_score` would be restating numbers already computed exactly,
 * with the added failure mode of contradicting them. So `action`,
 * `target_node_id`, `confidence_score` and the verdict's label are all
 * derived without a model; Gemini is called only to fill `node_data`, and
 * only after the branch is settled.
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
  /** What the matched card is to this one (novelty.ts), and its human label. */
  relation: Relation;
  label: string;
  /** The full verdict: summary, evidence, the match itself and anything else worth knowing. */
  verdict: NoveltyVerdict;
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
  /** The drill itself, so the candidate can be read against it (novelty.ts). */
  question: string;
  answer: string;
  questionType: QuestionType;
  domainName: string;
  fieldName: string;
}

/** The cosine bands for a given merge line (the DEDUP_PRECISION skill moves only that one). */
export const bandsFor = (mergeThreshold: number) => ({
  merge: mergeThreshold,
  saturation: SIMILARITY_SATURATION_MIN,
  related: SIMILARITY_NOVELTY_MAX,
});

const asNeighbour = (n: NeighbourNode): Neighbour => ({
  id: n.id,
  title: n.title,
  similarity: n.similarity,
  card: cardTextFromStored(n.questionType, n.question, n.answer),
  domainName: n.domainName,
  fieldName: n.fieldName,
});

/** The verdict on a candidate against its Field's neighbours and its nearest cards elsewhere. */
function verdictFor(card: CardText, neighbours: NeighbourNode[], elsewhere: NeighbourNode[], mergeThreshold: number): NoveltyVerdict {
  return judge(card, neighbours.map(asNeighbour), bandsFor(mergeThreshold), {
    crowdLine: SIMILARITY_N_SIMILAR_MIN,
    elsewhere: elsewhere.map(asNeighbour),
  });
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
  limit = 6
): Promise<NeighbourNode[]> {
  const literal = toVectorLiteral(embedding);
  return prisma.$queryRaw<NeighbourNode[]>`
    SELECT i.id, i."domainId", i.title, i."corePremise", i.tags,
           i.question, i.answer, i."questionType",
           d.name AS "domainName", f.name AS "fieldName",
           1 - (i.embedding <=> ${literal}::vector) AS similarity
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    JOIN "Field" f ON f.id = d."fieldId"
    WHERE d."fieldId" = ${fieldId}
      AND i.embedding IS NOT NULL
      AND i."isArchived" = false
    ORDER BY i.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

/**
 * The closest cards in *other* Fields. Only reported, never acted on — the
 * user chose this Field — but a card already filed under Chemistry is worth
 * mentioning when the same one is being added to Biology. Issued alongside
 * the Field query, so it costs no extra round trip.
 */
async function findNearestElsewhere(fieldId: string, embedding: number[], limit = 3): Promise<NeighbourNode[]> {
  const literal = toVectorLiteral(embedding);
  return prisma.$queryRaw<NeighbourNode[]>`
    SELECT i.id, i."domainId", i.title, i."corePremise", i.tags,
           i.question, i.answer, i."questionType",
           d.name AS "domainName", f.name AS "fieldName",
           1 - (i.embedding <=> ${literal}::vector) AS similarity
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    JOIN "Field" f ON f.id = d."fieldId"
    WHERE d."fieldId" <> ${fieldId}
      AND i.embedding IS NOT NULL
      AND i."isArchived" = false
    ORDER BY i.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
}

/** Both neighbour searches at once: the Field's own, and the nearest anywhere else. */
async function neighbourhood(fieldId: string, embedding: number[]) {
  const [neighbours, elsewhere] = await Promise.all([
    findNearestNodes(fieldId, embedding),
    findNearestElsewhere(fieldId, embedding),
  ]);
  return { neighbours, elsewhere };
}

export interface AnalysisResult {
  decision: DedupDecision;
  embedding: number[];
  neighbours: NeighbourNode[];
  /** The Domain of the card the decision names, for a stopped submission's "Link" to file beside. */
  targetDomainId: string | null;
}

export interface CandidatePreview {
  /** What would happen: decided by cosine distance and the lexical reading together (novelty.ts). */
  action: DedupAction;
  /** Similarity to the closest existing node, or null when the Field is empty. */
  topSimilarity: number | null;
  /** Nearest existing nodes, closest first — what the submission is competing with — each with what it is to this one. */
  neighbours: { id: string; title: string | null; similarity: number; relation: Relation | null; label: string | null }[];
  /** How many neighbours clear the N_similar line, which is what decays the payout. */
  nSimilar: number;
  verdict: NoveltyVerdict;
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
export async function previewCandidate(
  fieldId: string,
  card: CardText,
  contentText: string,
  mergeThreshold = SIMILARITY_MERGE_MIN
): Promise<CandidatePreview> {
  const embedding = await embedText(contentText);
  const { neighbours, elsewhere } = await neighbourhood(fieldId, embedding);
  const verdict = verdictFor(card, neighbours, elsewhere, mergeThreshold);
  const named = new Map([...(verdict.match ? [verdict.match] : []), ...verdict.also].map((m) => [m.id, m]));

  return {
    action: verdict.action,
    topSimilarity: neighbours[0]?.similarity ?? null,
    neighbours: neighbours.slice(0, 3).map((n) => ({
      id: n.id,
      title: n.title,
      similarity: n.similarity,
      relation: named.get(n.id)?.relation ?? null,
      label: named.get(n.id)?.label ?? null,
    })),
    nSimilar: neighbours.filter((n) => n.similarity >= SIMILARITY_N_SIMILAR_MIN).length,
    verdict,
  };
}

/** The reasoning string logged with every decision: the verdict in one line, then its evidence. */
function reasoning(v: NoveltyVerdict): string {
  return `${v.label}. ${v.summary} [${v.evidence.join("; ")}]`;
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
  /** The candidate as prompt and answer text, for the lexical half of the verdict. */
  card: CardText,
  mergeThreshold = SIMILARITY_MERGE_MIN,
  /**
   * Reuses a vector the caller already paid for. Field routing needs the
   * embedding before deduplication runs, and embedding is the only external
   * API call on the write path — doing it twice doubles the cost of every
   * submission to answer two questions about the same text.
   */
  precomputed?: number[]
): Promise<AnalysisResult> {
  const embedding = precomputed ?? (await embedText(contentText));
  const { neighbours, elsewhere } = await neighbourhood(fieldId, embedding);
  const verdict = verdictFor(card, neighbours, elsewhere, mergeThreshold);
  const target = verdict.match ? neighbours.find((n) => n.id === verdict.match!.id) ?? null : null;
  const base = {
    relation: verdict.relation,
    label: verdict.label,
    verdict,
    deduplication_reasoning: reasoning(verdict),
    confidence_score: verdict.confidence,
  };

  if (verdict.action === "CREATE_NEW_NODE" || !target) {
    const node = await synthesizeNodeData(fieldName, contentText);
    return {
      embedding,
      neighbours,
      targetDomainId: null,
      decision: { ...base, action: "CREATE_NEW_NODE", target_node_id: null, node_data: toNodeData(node) },
    };
  }

  // No synthesis call on either stopping branch: a merge keeps the existing
  // node's wording, and a stopped submission writes nothing until the user
  // chooses Link or Enrich — both of which do their own.
  return {
    embedding,
    neighbours,
    targetDomainId: target.domainId,
    decision: { ...base, action: verdict.action, target_node_id: target.id, node_data: null },
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
