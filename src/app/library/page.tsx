import type { Metadata } from "next";
import { loadFieldInsights } from "@/lib/field-insight";
import { getCurrentUserId } from "@/lib/user";
import { LibrarySearch } from "@/components/library/LibrarySearch";
import type { LibraryField } from "@/components/library/library-model";
// Revision 5, lane 9 (contracts ruling 67): the Gemini mark on a Domain Gemini named, until you rename it.
import { geminiNamedOf } from "@/lib/roadmap-types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Library" };

/**
 * The tree, every idea with its outlook, and every Field's summary, plus the
 * request time. The time is read here, once per request, and passed down so
 * the server render and the browser agree on what is "due now" and what is
 * fading (no clock read during a render).
 */
async function loadLibrary() {
  const now = new Date();
  const insight = await loadFieldInsights(getCurrentUserId(), now);
  return { ...insight, now: now.getTime() };
}

/**
 * Study › Library (Browse). Search and every filter family live in the URL
 * (the client reads them with useSearchParams), the filters open as a sheet,
 * a Field tile opens that Field's pop-up (its level, health, attributes and
 * achievements; "Filter the list" keeps the old tap, "Open the Field" goes to
 * /library/field/[fieldId]), and an idea opens as a sheet on compact and a
 * right drawer from 600, with its own page at /library/[id] for deep links from Review.
 */
export default async function LibraryPage() {
  const { tree, ideas, summaries, now } = await loadLibrary();

  const fields: LibraryField[] = tree.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    domains: f.domains.map((d) => ({ id: d.id, name: d.name, level: d.level, geminiNamed: geminiNamedOf(d) })),
  }));

  // Tag vocabulary, ranked by frequency so the most useful filters lead.
  const tagCounts = new Map<string, number>();
  for (const idea of ideas) {
    for (const tag of idea.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);

  return (
    <div className="page cq-main">
      <LibrarySearch ideas={ideas} fields={fields} summaries={summaries} allTags={allTags} now={now} />
    </div>
  );
}
