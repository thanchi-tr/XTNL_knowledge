import type { Metadata } from "next";
import { loadLibraryTree } from "@/lib/queries";
import { LibrarySearch } from "@/components/library/LibrarySearch";
import type { LibraryField, LibraryIdea } from "@/components/library/library-model";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Library" };

/**
 * The tree plus the request time. The time is read here, once per request,
 * and passed down so the server render and the browser agree on what is
 * "due now" (no clock read during a render).
 */
async function loadLibrary() {
  const tree = await loadLibraryTree();
  return { tree, now: Date.now() };
}

/**
 * Study › Library (Browse). Search and every filter family live in the URL
 * (the client reads them with useSearchParams), the filters open as a sheet,
 * and an idea opens as a sheet on compact and a right drawer from 600, with
 * its own page at /library/[id] for deep links from Review.
 */
export default async function LibraryPage() {
  const { tree, now } = await loadLibrary();

  const ideas: LibraryIdea[] = tree.flatMap((f) =>
    f.domains.flatMap((d) =>
      d.ideas.map((i) => ({
        id: i.id,
        question: i.question,
        answer: i.answer,
        questionType: i.questionType,
        collectionLabel: i.collectionLabel,
        level: i.level,
        isArchived: i.isArchived,
        fieldId: f.id,
        fieldName: f.name,
        domainId: d.id,
        domainName: d.name,
        // Node data from the dedup pipeline. Nullable on anything created
        // before it existed, so every consumer treats it as optional.
        title: i.title,
        corePremise: i.corePremise,
        tags: i.tags,
        linkedCount: i.linkedIdeaIds.length,
        difficulty: i.difficulty,
        dueAt: i.dueDate.getTime(),
        failedAttempts: i.failedAttempts,
        createdAt: i.createdAt.getTime(),
      }))
    )
  );

  const fields: LibraryField[] = tree.map((f) => ({
    id: f.id,
    name: f.name,
    level: f.level,
    domains: f.domains.map((d) => ({ id: d.id, name: d.name })),
  }));

  // Tag vocabulary, ranked by frequency so the most useful filters lead.
  const tagCounts = new Map<string, number>();
  for (const idea of ideas) {
    for (const tag of idea.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);

  return (
    <div className="page cq-main">
      <LibrarySearch ideas={ideas} fields={fields} allTags={allTags} now={now} />
    </div>
  );
}
