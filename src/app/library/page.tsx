import { loadLibraryTree } from "@/lib/queries";
import { LibrarySearch, type LibraryIdea } from "@/components/library/LibrarySearch";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const fields = await loadLibraryTree();

  const ideas: LibraryIdea[] = fields.flatMap((f) =>
    f.domains.flatMap((d) =>
      d.ideas.map((i) => ({
        id: i.id,
        question: i.question,
        answer: i.answer,
        questionType: i.questionType,
        collectionLabel: i.collectionLabel,
        level: i.level,
        isArchived: i.isArchived,
        fieldName: f.name,
        domainName: d.name,
        // Node data from the dedup pipeline. Nullable on anything created
        // before it existed, so every consumer treats it as optional.
        title: i.title,
        corePremise: i.corePremise,
        tags: i.tags,
        linkedCount: i.linkedIdeaIds.length,
      }))
    )
  );

  const fieldNames = fields.map((f) => f.name);
  const domainsByField: Record<string, string[]> = {};
  for (const f of fields) domainsByField[f.name] = f.domains.map((d) => d.name);

  // Tag vocabulary, ranked by frequency so the most useful filters lead.
  const tagCounts = new Map<string, number>();
  for (const idea of ideas) {
    for (const tag of idea.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  const allTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Knowledge Engine</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            Library
          </h1>
        </div>
        <p className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
          {ideas.length} idea{ideas.length === 1 ? "" : "s"} indexed
        </p>
      </header>
      <div className="fade-up fade-up-1">
        <LibrarySearch
          ideas={ideas}
          fieldNames={fieldNames}
          domainsByField={domainsByField}
          allTags={allTags}
        />
      </div>
    </main>
  );
}
