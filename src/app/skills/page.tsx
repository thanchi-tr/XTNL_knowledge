import type { Metadata } from "next";
import { SkillsScreen } from "@/components/skills/SkillsScreen";

export const metadata: Metadata = { title: "Skills" };

// Ownership, balance and gates change on every unlock and review.
export const dynamic = "force-dynamic";

/**
 * You › Skills. Opens on the path with the most emblems ready to unlock
 * (else the highest attribute); every path has its own URL, /skills/<slug>.
 */
export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <SkillsScreen attribute={null} view={view === "graph" ? "graph" : "ladder"} />;
}
