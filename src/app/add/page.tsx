import { loadFieldsForCapture } from "@/lib/queries";
import { loadVocabulary, loadStructureWords } from "@/lib/vocabulary";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { AddIdeaForm, type AddFormField } from "@/components/AddIdeaForm";
import { DraftPrefill } from "@/components/capture/DraftPrefill";

export const dynamic = "force-dynamic";

/** Enough of the split to be informative without turning the form into a chart. */
const COMPOSITION_PREVIEW_COUNT = 4;

const FORM_ID = "add-idea-form";

interface IdeaDraft {
  question: string;
  answer: string;
}

/**
 * An 'idea: …' line from the capture sheet, waiting in the Inbox. The line
 * may carry its answer after '::' ('why do bonds fall :: rates rise'), the
 * form M3's one-box capture will also write. Fails soft to no draft: a
 * missing or foreign id just opens the empty form.
 */
async function loadIdeaDraft(id: string | undefined): Promise<IdeaDraft | null> {
  if (!id || id.length > 64) return null;
  try {
    const row = await prisma.taskTemplate.findFirst({
      where: { id, userId: getCurrentUserId(), kind: "IDEA_DRAFT", archivedAt: null },
      select: { title: true, note: true },
    });
    if (!row) return null;
    const [question, ...rest] = row.title.split(/\s*::\s*/);
    return { question: question.trim(), answer: (row.note ?? rest.join(" :: ")).trim() };
  } catch {
    return null;
  }
}

export default async function AddIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { draft: draftParam } = await searchParams;
  // Domains are offered as explicit placement targets in the form. Without
  // them an empty hand-created Domain is unreachable — discovery routes by
  // nearest existing Idea, and an empty Domain has none.
  const [rows, vocab, structure, draft] = await Promise.all([
    loadFieldsForCapture(),
    loadVocabulary(),
    loadStructureWords(),
    loadIdeaDraft(typeof draftParam === "string" ? draftParam : undefined),
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
        {draft && (
          <div
            className="fade-up mb-4 px-3 py-2.5"
            style={{ borderRadius: 10, background: "var(--blue-10)", border: "1px solid rgba(77,156,245,0.26)" }}
          >
            <p className="label-xs" style={{ fontSize: 9.5, color: "var(--blue)" }}>
              From quick capture
            </p>
            <p className="mt-1" style={{ fontSize: 13, color: "var(--ink-0)" }}>
              {draft.question}
              {draft.answer && <span style={{ color: "var(--ink-2)" }}> · {draft.answer}</span>}
            </p>
            <p className="mt-1" style={{ fontSize: 11, color: "var(--ink-3)" }}>
              Filled in below. The line stays in your Inbox until you drop it there.
            </p>
          </div>
        )}
        <div id={FORM_ID} className="fade-up fade-up-1">
          <AddIdeaForm fields={fields} vocabulary={vocabulary} />
        </div>
        {draft && <DraftPrefill question={draft.question} answer={draft.answer} targetId={FORM_ID} />}
      </div>
    </main>
  );
}
