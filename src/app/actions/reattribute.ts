"use server";

import { prisma } from "@/lib/prisma";
import { invalidateAll } from "@/lib/cache";
import { ATTRIBUTES, emptyComposition, type Composition } from "@/lib/attributes";
import { inferComposition } from "@/lib/attribute-inference";
import { compositionRows } from "@/lib/attribute-assignment";

/**
 * Recomputes every stored Field and Domain composition from their names using
 * the current lexicon.
 *
 * Attribution is written once, at creation. That is the right default — it
 * keeps a Domain's identity stable as ideas accumulate — but it means an
 * improvement to the lexicon reaches only rows created afterwards, and the
 * account's whole existing taxonomy keeps whatever the lexicon said on the
 * day it was made.
 *
 * The measured effect on this account: three of six Fields were stored as the
 * generic fallback, with "Computer Science" and "Biological & Chemical
 * Sciences" holding byte-identical compositions, and "Business & Finance"
 * identical to "Trading". Fields stored identically cannot be told apart by
 * anything downstream — not routing, not skill gates — however good the
 * inference that reads them.
 *
 * Ideas are deliberately left alone. Their attribution is a record of what
 * was inferred when they were written, the Domain has already absorbed it via
 * `blendObservation`, and re-deriving it would silently rewrite history for no
 * gain. Domain and Field compositions are *current beliefs* about what a
 * container is for, so those are fair to recompute.
 */

export interface ReattributeSummary {
  fields: { name: string; before: string; after: string; changed: boolean }[];
  domainsUpdated: number;
  domainsUnchanged: number;
}

/** The two or three attributes that actually characterise a composition. */
function describe(c: Composition): string {
  return [...ATTRIBUTES]
    .sort((a, b) => c[b] - c[a])
    .slice(0, 3)
    .filter((a) => c[a] > 0)
    .map((a) => `${a}:${c[a].toFixed(0)}`)
    .join(" ");
}

function sameComposition(a: Composition, b: Composition): boolean {
  // A tenth of a point is far below anything the UI renders or a gate reads.
  return ATTRIBUTES.every((attr) => Math.abs(a[attr] - b[attr]) < 0.1);
}

async function storedComposition(
  rows: { attribute: (typeof ATTRIBUTES)[number]; weight: number }[]
): Promise<Composition> {
  const out = emptyComposition();
  for (const r of rows) out[r.attribute] = r.weight;
  return out;
}

export async function reattributeTaxonomy(): Promise<ReattributeSummary> {
  const fields = await prisma.field.findMany({
    relationLoadStrategy: "join",
    select: {
      id: true,
      name: true,
      attributes: { select: { attribute: true, weight: true } },
      domains: {
        select: { id: true, name: true, attributes: { select: { attribute: true, weight: true } } },
      },
    },
  });

  const summary: ReattributeSummary = { fields: [], domainsUpdated: 0, domainsUnchanged: 0 };

  for (const field of fields) {
    const before = await storedComposition(field.attributes);
    const { composition: after, confidence: fieldEvidence } = inferComposition({ text: field.name });
    const changed = !sameComposition(before, after);

    if (changed) {
      // Replace rather than upsert: the attribute set is fixed and complete,
      // so a full rewrite cannot leave a stale row behind.
      await prisma.$transaction([
        prisma.fieldAttribute.deleteMany({ where: { fieldId: field.id } }),
        prisma.fieldAttribute.createMany({
          data: compositionRows(after).map((r) => ({ ...r, fieldId: field.id })),
        }),
      ]);
    }

    summary.fields.push({
      name: field.name,
      before: describe(before) || "(none)",
      after: describe(after),
      changed,
    });

    /**
     * Domains re-infer with the *new* Field composition as their prior, so a
     * corrected Field propagates to every Domain that inherited its mistake.
     *
     * But only when the Field's name actually meant something. A name the
     * lexicon cannot read — "Personal Skill" — infers to the generic
     * fallback, and passing that down as a prior is not neutral: it is a
     * confident-looking average that drowns whatever weak signal the Domain's
     * own name carried. Measured here, it turned "Systematic Discipline" into
     * MIND rather than STUBBORNNESS, and the Field then re-derived its
     * identity from those flattened Domains — a loop that kept the whole
     * branch generic. No evidence is not a prior.
     */
    const prior = fieldEvidence > 0 ? after : undefined;
    for (const domain of field.domains) {
      const domBefore = await storedComposition(domain.attributes);
      const { composition: domAfter } = inferComposition({ text: domain.name, prior });
      if (sameComposition(domBefore, domAfter)) {
        summary.domainsUnchanged++;
        continue;
      }
      await prisma.$transaction([
        prisma.domainAttribute.deleteMany({ where: { domainId: domain.id } }),
        prisma.domainAttribute.createMany({
          data: compositionRows(domAfter).map((r) => ({ ...r, domainId: domain.id })),
        }),
      ]);
      summary.domainsUpdated++;
    }
  }

  invalidateAll();
  return summary;
}
