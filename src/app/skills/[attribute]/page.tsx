import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/attributes";
import { attributeFromSlug, attributeSlug } from "@/lib/attribute-themes";
import { SkillsScreen } from "@/components/skills/SkillsScreen";

export const dynamic = "force-dynamic";

/** All thirteen paths are known at build time, so their routes can be enumerated. */
export function generateStaticParams() {
  return ATTRIBUTES.map((attribute) => ({ attribute: attributeSlug(attribute) }));
}

export async function generateMetadata({ params }: { params: Promise<{ attribute: string }> }): Promise<Metadata> {
  const { attribute: slug } = await params;
  const attribute = attributeFromSlug(slug);
  if (!attribute) return { title: "Unknown path" };
  return { title: `${ATTRIBUTE_META[attribute].label} path` };
}

/** One path: its sky, its rank ladder (or ?view=graph) and the two-step unlock (?emblem=<code> opens one). */
export default async function SkillPathPage({
  params,
  searchParams,
}: {
  params: Promise<{ attribute: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ attribute: slug }, { view }] = await Promise.all([params, searchParams]);
  const attribute = attributeFromSlug(slug);
  if (!attribute) notFound();
  return <SkillsScreen attribute={attribute} view={view === "graph" ? "graph" : "ladder"} />;
}
