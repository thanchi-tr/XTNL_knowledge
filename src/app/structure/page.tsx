import type { Metadata } from "next";
import { listTaxonomy } from "@/lib/taxonomy";
import { TaxonomyManager } from "@/components/taxonomy/TaxonomyManager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fields & Domains" };

/**
 * Study › Fields & Domains (was /taxonomy, which redirects here): create
 * Fields and Domains by hand and edit a Field's composition. The top bar
 * carries the title; Re-attribute and the resets are in Settings › Data.
 */
export default async function StructurePage() {
  const tree = await listTaxonomy();
  return (
    <div className="page narrow cq-main">
      <TaxonomyManager initialTree={tree} />
    </div>
  );
}
