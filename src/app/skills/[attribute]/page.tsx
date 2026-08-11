import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadProgression } from "@/lib/skill-effects";
import { getMasteryBalance } from "@/lib/mastery";
import { loadProgressRates } from "@/lib/progress-rate";
import { getCurrentUserId } from "@/lib/user";
import { ATTRIBUTES, ATTRIBUTE_META } from "@/lib/attributes";
import { attributeFromSlug, attributeSlug, themeFor } from "@/lib/attribute-themes";
import { PathView } from "@/components/skills/PathView";

export const dynamic = "force-dynamic";

/** All thirteen paths are known at build time, so their routes can be enumerated. */
export function generateStaticParams() {
  return ATTRIBUTES.map((attribute) => ({ attribute: attributeSlug(attribute) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ attribute: string }>;
}): Promise<Metadata> {
  const { attribute: slug } = await params;
  const attribute = attributeFromSlug(slug);
  if (!attribute) return { title: "Unknown path" };
  return { title: `${ATTRIBUTE_META[attribute].label} path` };
}

export default async function SkillPathPage({ params }: { params: Promise<{ attribute: string }> }) {
  const { attribute: slug } = await params;
  const attribute = attributeFromSlug(slug);
  if (!attribute) notFound();

  const userId = getCurrentUserId();
  const [progression, masteryBalance, rates] = await Promise.all([
    loadProgression(userId),
    getMasteryBalance(userId),
    loadProgressRates(userId),
  ]);

  const theme = themeFor(attribute);

  return (
    <main className="site-container flex-1 py-8">
      <nav className="fade-up mb-4 flex items-center gap-2" style={{ fontSize: 11 }}>
        <Link href="/skills" className="no-underline" style={{ color: "var(--ink-2)" }}>
          Skills
        </Link>
        <span style={{ color: "var(--ink-3)" }}>/</span>
        <span style={{ color: theme.color, fontWeight: 600 }}>{ATTRIBUTE_META[attribute].label}</span>
        <span className="ml-auto mono" style={{ color: "var(--ink-3)" }}>
          {masteryBalance.toFixed(masteryBalance < 100 ? 1 : 0)} MP
        </span>
      </nav>

      <div className="fade-up fade-up-1">
        <PathView
          attribute={attribute}
          scores={progression.scores}
          ownedCodes={progression.ownedCodes}
          masteryBalance={masteryBalance}
          modifiers={progression.modifiers}
          masteryPerDay={rates.masteryPerDay}
          scorePerDay={rates.scorePerDay}
        />
      </div>
    </main>
  );
}
