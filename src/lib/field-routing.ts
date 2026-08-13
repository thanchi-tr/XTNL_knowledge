import { prisma } from "./prisma";
import { toVectorLiteral } from "./vector";
import { ATTRIBUTES, emptyComposition, type Composition } from "./attributes";
import { inferComposition, effectiveFieldComposition } from "./attribute-inference";

/**
 * Automatic Field selection.
 *
 * Domains have been discovered automatically since the beginning, but the
 * Field was always a required argument — so the one structural decision left
 * to the user was the one they were least equipped to make quickly, before
 * having written the idea down. This picks it from the same two signals the
 * rest of the taxonomy already runs on.
 *
 * Two independent kinds of evidence, tried in order of how much they prove:
 *
 *  1. **Semantic.** The nearest existing Idea across every Field, by the same
 *     pgvector cosine search used for Domain routing. If something you have
 *     already written is genuinely close, its Field is the answer, and no
 *     amount of lexical cleverness beats that.
 *  2. **Attribute.** Failing that, the composition inferred from the text is
 *     compared against each Field's *effective* composition — the Field's own
 *     name blended with what its Domains actually turned out to be about.
 *     This is what lets a Field receive its first Idea on a new subject: it
 *     has no near neighbours yet, but it is demonstrably about statistics.
 *
 * **It never creates a Field.** Domains auto-create because they are cheap,
 * numerous and easily merged; Fields are the top of the taxonomy and the unit
 * the user deliberately designs. Silently minting them from a stray sentence
 * would sprawl the structure that the whole attribute substrate rests on. When
 * nothing fits, the best available Field is still returned along with a low
 * confidence, so the caller can offer to create one rather than pretend.
 */

/** Cosine on the nearest existing Idea above which its Field is simply correct. */
const SEMANTIC_MIN = 0.55;

/**
 * Correlation above which an attribute match is worth acting on.
 *
 * This is a *centred* correlation, not raw cosine. Compositions are
 * non-negative and normalised to the same total, so plain cosine put every
 * pair between 0.6 and 1.0 and the ranking was dominated by whichever field
 * happened to carry slightly more MIND. Measured against the real account it
 * sent "hash map" to Mathematics, "covalent bond" to Computer Science and
 * "hypertrophy training" to Business & Finance. Subtracting each vector's own
 * mean first compares *shapes* — what a field is unusually about — which is
 * the only part that distinguishes one from another.
 */
const ATTRIBUTE_MIN = 0.45;

export type FieldBasis = "SEMANTIC" | "ATTRIBUTE" | "ONLY" | "WEAK";

export interface FieldChoice {
  fieldId: string;
  fieldName: string;
  /** How the choice was reached — the UI states this rather than implying certainty. */
  basis: FieldBasis;
  /** 0–1. `WEAK` means nothing fitted well and the caller should offer to create a Field. */
  confidence: number;
}

/**
 * Correlation between two compositions, each centred on its own mean.
 *
 * Centring is what makes this discriminate at all: every composition sums to
 * the same total over the same 13 attributes, so the uncentred angle between
 * any two is small and says little. What distinguishes a Field is where it
 * departs from the average — which attributes it is unusually high and
 * unusually low in — and that is exactly what remains after the mean is
 * removed. Ranges -1 to 1.
 */
function correlation(a: Composition, b: Composition): number {
  const n = ATTRIBUTES.length;
  let meanA = 0;
  let meanB = 0;
  for (const attr of ATTRIBUTES) {
    meanA += a[attr];
    meanB += b[attr];
  }
  meanA /= n;
  meanB /= n;

  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const attr of ATTRIBUTES) {
    const da = a[attr] - meanA;
    const db = b[attr] - meanB;
    dot += da * db;
    na += da * da;
    nb += db * db;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface NearestAcrossFields {
  fieldId: string;
  similarity: number;
}

/**
 * Nearest embedded Idea in the whole account, with the Field it belongs to.
 *
 * Deliberately not per-Field-then-compare: one ANN scan over the shared HNSW
 * index answers this in a single round trip, where looping Fields would cost
 * one query each on the slowest link in the app.
 */
async function nearestAcrossFields(embedding: number[]): Promise<NearestAcrossFields | null> {
  const literal = toVectorLiteral(embedding);
  const rows = await prisma.$queryRaw<NearestAcrossFields[]>`
    SELECT d."fieldId", 1 - (i.embedding <=> ${literal}::vector) AS similarity
    FROM "Idea" i
    JOIN "Domain" d ON d.id = i."domainId"
    WHERE i.embedding IS NOT NULL
      AND i."isArchived" = false
    ORDER BY i.embedding <=> ${literal}::vector
    LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Every Field with the effective composition its Domains have given it. */
async function fieldProfiles(): Promise<{ id: string; name: string; composition: Composition }[]> {
  const fields = await prisma.field.findMany({
    relationLoadStrategy: "join",
    select: {
      id: true,
      name: true,
      attributes: { select: { attribute: true, weight: true } },
      domains: {
        select: {
          totalPoints: true,
          attributes: { select: { attribute: true, weight: true } },
        },
      },
    },
  });

  return fields.map((f) => {
    const own = emptyComposition();
    for (const a of f.attributes) own[a.attribute] = a.weight;

    const domains = f.domains
      .filter((d) => d.attributes.length > 0)
      .map((d) => {
        const composition = emptyComposition();
        for (const a of d.attributes) composition[a.attribute] = a.weight;
        return { composition: composition as Composition, totalPoints: d.totalPoints };
      });

    return {
      id: f.id,
      name: f.name,
      composition: effectiveFieldComposition(own as Composition, domains),
    };
  });
}

/**
 * Chooses the Field a new Idea belongs to.
 *
 * `embedding` is passed in rather than computed here: the submit path has
 * already embedded the text for deduplication, and embedding twice would
 * double the only external API call on the write path.
 *
 * Returns `null` only when the account has no Fields at all — there is
 * nothing to choose, and the caller must ask.
 */
export async function pickField(embedding: number[], contentText: string): Promise<FieldChoice | null> {
  const profiles = await fieldProfiles();
  if (profiles.length === 0) return null;
  if (profiles.length === 1) {
    return { fieldId: profiles[0].id, fieldName: profiles[0].name, basis: "ONLY", confidence: 1 };
  }

  const nearest = await nearestAcrossFields(embedding);
  if (nearest && nearest.similarity >= SEMANTIC_MIN) {
    const hit = profiles.find((p) => p.id === nearest.fieldId);
    if (hit) {
      return {
        fieldId: hit.id,
        fieldName: hit.name,
        basis: "SEMANTIC",
        confidence: nearest.similarity,
      };
    }
  }

  const { composition, confidence: evidence } = inferComposition({ text: contentText });

  // Text with no lexical evidence falls back to a generic composition, which
  // correlates near-perfectly with whichever Field is closest to average. Left
  // unguarded this was the *most* confident branch in the whole function:
  // "What did chapter four say about the second thing?" routed at 1.000. No
  // evidence must mean no confidence, so the caller asks instead of guessing.
  if (evidence === 0) {
    return { fieldId: profiles[0].id, fieldName: profiles[0].name, basis: "WEAK", confidence: 0 };
  }

  let best = profiles[0];
  let bestScore = -Infinity;
  for (const p of profiles) {
    const score = correlation(composition, p.composition);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  // Discounted by how much the text actually said. A single weak keyword
  // should not produce the same confidence as a paragraph on the subject.
  const confidence = Math.max(0, bestScore) * evidence;

  return {
    fieldId: best.id,
    fieldName: best.name,
    basis: bestScore >= ATTRIBUTE_MIN ? "ATTRIBUTE" : "WEAK",
    confidence,
  };
}
