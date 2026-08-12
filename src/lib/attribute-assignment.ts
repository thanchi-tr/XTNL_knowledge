import type { Prisma, QuestionType } from "@prisma/client";
import { prisma } from "./prisma";
import { invalidate } from "./cache";
import { ATTRIBUTES, emptyComposition, type Composition } from "./attributes";
import { inferComposition, blendObservation, dominantOf } from "./attribute-inference";

/**
 * Persistence for automatic attribute assignment.
 *
 * `attribute-inference.ts` decides *what* a Field, Domain or Idea is about;
 * this writes that decision down and keeps the three levels consistent with
 * each other. Split so the algorithm stays pure and testable — it is the
 * substrate every skill gate ultimately reads from, and it should be
 * possible to reason about it without a database.
 */

export function compositionRows(composition: Composition) {
  return ATTRIBUTES.map((attribute) => ({ attribute, weight: composition[attribute] }));
}

/** A Field's stored composition, or an empty one for Fields that predate assignment. */
export async function fieldComposition(fieldId: string): Promise<Composition> {
  const rows = await prisma.fieldAttribute.findMany({
    where: { fieldId },
    select: { attribute: true, weight: true },
  });
  const out = emptyComposition();
  for (const r of rows) out[r.attribute] = r.weight;
  return out;
}

export async function domainComposition(domainId: string): Promise<Composition> {
  const rows = await prisma.domainAttribute.findMany({
    where: { domainId },
    select: { attribute: true, weight: true },
  });
  const out = emptyComposition();
  for (const r of rows) out[r.attribute] = r.weight;
  return out;
}

/**
 * Infers and stores a Domain's split at creation, using its parent Field as
 * the prior. Runs inside the caller's transaction when one is supplied so a
 * Domain is never briefly visible without attribution.
 */
export async function assignDomainComposition(
  domainId: string,
  domainName: string,
  prior: Composition,
  tx: Prisma.TransactionClient | typeof prisma = prisma
): Promise<Composition> {
  const { composition } = inferComposition({ text: domainName, prior });

  await tx.domainAttribute.createMany({
    data: compositionRows(composition).map((r) => ({ domainId, ...r })),
    skipDuplicates: true,
  });

  invalidate("fields");
  return composition;
}

export interface IdeaAssignment {
  /** Stored on the Idea as a single label. */
  dominant: ReturnType<typeof dominantOf>;
  /** The full split the Idea contributed to its Domain. */
  composition: Composition;
}

/**
 * Assigns an Idea's attribute and folds it into its Domain.
 *
 * The Idea keeps only its dominant attribute — a label, useful for display
 * and filtering. The full vector goes into the Domain via
 * `blendObservation`, whose pull shrinks as the Domain accumulates
 * observations, so an established Domain cannot be yanked sideways by one
 * unusual submission while a young one still finds its shape quickly.
 *
 * Deliberately *not* run inside the Idea-creation transaction: a failure to
 * attribute should never lose a submission the user actually typed. The
 * Idea is the durable thing; its attribution is derived and can be
 * recomputed.
 */
export async function assignIdeaAttribution(
  ideaId: string,
  domainId: string,
  text: string,
  questionType: QuestionType
): Promise<IdeaAssignment> {
  const [current, domain] = await Promise.all([
    domainComposition(domainId),
    prisma.domain.findUniqueOrThrow({
      where: { id: domainId },
      select: { attributeObservations: true, fieldId: true },
    }),
  ]);

  // A Domain with no stored split yet (created before assignment existed)
  // falls back to its Field, so the first Idea blends against something
  // meaningful rather than against thirteen zeroes.
  const prior = ATTRIBUTES.some((a) => current[a] > 0) ? current : await fieldComposition(domain.fieldId);

  const { composition } = inferComposition({ text, prior, questionType });
  const blended = blendObservation(prior, composition, domain.attributeObservations);
  const dominant = dominantOf(composition);

  await prisma.$transaction([
    prisma.idea.update({ where: { id: ideaId }, data: { attribute: dominant } }),
    ...compositionRows(blended).map((r) =>
      prisma.domainAttribute.upsert({
        where: { domainId_attribute: { domainId, attribute: r.attribute } },
        create: { domainId, attribute: r.attribute, weight: r.weight },
        update: { weight: r.weight },
      })
    ),
    prisma.domain.update({
      where: { id: domainId },
      data: { attributeObservations: { increment: 1 } },
    }),
  ]);

  invalidate("fields", "ideas");
  return { dominant, composition };
}
