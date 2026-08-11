import type { Attribute } from "@prisma/client";
import { prisma } from "./prisma";
import { emptyComposition, type Composition } from "./attributes";

/**
 * Taxonomy reads.
 *
 * Kept out of app/actions/taxonomy.ts on purpose: every export of a
 * "use server" module becomes a callable endpoint, and this is a plain
 * server-side query the Taxonomy page calls directly during render. It
 * never needs to be reachable from the browser, so it shouldn't be.
 */

export interface TaxonomyTree {
  id: string;
  name: string;
  level: number;
  /** This Field's attribute-weight split — all zeros for a Field predating the composition backfill. */
  composition: Composition;
  domains: { id: string; name: string; level: number; totalPoints: number; ideaCount: number }[];
}

/** Fields with their Domains, Idea counts, and attribute composition, for the taxonomy manager UI. */
export async function listTaxonomy(): Promise<TaxonomyTree[]> {
  const fields = await prisma.field.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      level: true,
      attributes: { select: { attribute: true, weight: true } },
      domains: {
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          level: true,
          totalPoints: true,
          _count: { select: { ideas: true } },
        },
      },
    },
  });

  return fields.map((f) => {
    const composition = emptyComposition();
    for (const a of f.attributes) composition[a.attribute as Attribute] = a.weight;
    return {
      id: f.id,
      name: f.name,
      level: f.level,
      composition,
      domains: f.domains.map((d) => ({
        id: d.id,
        name: d.name,
        level: d.level,
        totalPoints: d.totalPoints,
        ideaCount: d._count.ideas,
      })),
    };
  });
}
