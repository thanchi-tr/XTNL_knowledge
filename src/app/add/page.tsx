import { loadFieldsForCapture } from "@/lib/queries";
import { loadVocabulary, loadStructureWords } from "@/lib/vocabulary";
import { AddIdeaForm, type AddFormField } from "@/components/AddIdeaForm";

export const dynamic = "force-dynamic";

/** Enough of the split to be informative without turning the form into a chart. */
const COMPOSITION_PREVIEW_COUNT = 4;

export default async function AddIdeaPage() {
  // Domains are offered as explicit placement targets in the form. Without
  // them an empty hand-created Domain is unreachable — discovery routes by
  // nearest existing Idea, and an empty Domain has none.
  const [rows, vocab, structure] = await Promise.all([
    loadFieldsForCapture(),
    loadVocabulary(),
    loadStructureWords(),
  ]);

  // Structure names first: they are words the player committed to rather than
  // merely typed, and they are worth suggesting from the very first Idea,
  // before any corpus exists for the frequency floor to work on. De-duped
  // case-insensitively so a Field called "Trading" does not shadow the same
  // word earned from the corpus.
  const seen = new Set<string>();
  const vocabulary: string[] = [];
  for (const word of [...structure, ...vocab.map((v) => v.word)]) {
    const key = word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    vocabulary.push(word);
  }

  const fields: AddFormField[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    domains: f.domains,
    composition: f.attributes
      .filter((a) => a.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, COMPOSITION_PREVIEW_COUNT),
  }));

  return (
    <main className="site-container flex-1 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <header className="fade-up mb-6">
          <p className="section-eyebrow">Capture</p>
          <h1 className="mt-1.5 text-[19px] font-semibold tracking-tight" style={{ color: "var(--ink-0)" }}>
            New Idea
          </h1>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--ink-2)" }}>
            Submissions are embedded and checked against existing ideas before anything is written.
          </p>
        </header>
        <div className="fade-up fade-up-1">
          <AddIdeaForm fields={fields} vocabulary={vocabulary} />
        </div>
      </div>
    </main>
  );
}
