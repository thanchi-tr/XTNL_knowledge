import type { Metadata } from "next";
import { loadFieldsForCapture } from "@/lib/queries";
import { loadVocabulary, loadStructureWords } from "@/lib/vocabulary";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadProgression } from "@/lib/skill-effects";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { AddIdeaForm, type AddFormField } from "@/components/AddIdeaForm";
import { Chip } from "@/components/ui/Chip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New idea" };

/** Enough of the split to be informative without turning the form into a chart. */
const COMPOSITION_PREVIEW_COUNT = 4;

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

/** Today's focus Field, for the form's hint. Soft: no focus is a fine answer. */
async function loadFocus() {
  try {
    const userId = getCurrentUserId();
    const progression = await loadProgression(userId);
    const focus = await loadDailyFocus(userId, progression.activeSkills);
    return focus && focus.multiplier > 1 ? { fieldId: focus.fieldId, fieldName: focus.fieldName, multiplier: focus.multiplier } : null;
  } catch {
    return null;
  }
}

/**
 * Study › New idea (the Form template, max 640). Question first; Field and
 * Domain are guessed from it; Advanced holds the format and the collection;
 * a sticky Check first / Create. A quick-capture draft (?draft=<id>) fills
 * the default Short fields.
 *
 * This page stays off the `main` container (no cq-main): the word-hint strip
 * is a fixed layer rendered inside the form.
 */
export default async function AddIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { draft: draftParam } = await searchParams;
  // Domains are offered as explicit placement targets: without them an empty
  // hand-created Domain is unreachable (discovery routes by nearest Idea).
  const [rows, vocab, structure, draft, focus] = await Promise.all([
    loadFieldsForCapture(),
    loadVocabulary(),
    loadStructureWords(),
    loadIdeaDraft(typeof draftParam === "string" ? draftParam : undefined),
    loadFocus(),
  ]);

  // Structure names first: words the player committed to, useful from the
  // very first Idea. De-duped case-insensitively.
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
    <div className="page narrow add-page">
      {draft && (
        <div className="card pad" style={{ margin: "8px 0 4px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="st-row">
            <Chip icon="inbox">
              From quick capture
            </Chip>
          </div>
          <p className="ink-0" style={{ margin: 0 }}>
            {draft.question}
            {draft.answer && <span className="ink-2"> · {draft.answer}</span>}
          </p>
          <p className="t-meta" style={{ margin: 0 }}>
            Filled in below. The line stays in your Inbox until you drop it there.
          </p>
        </div>
      )}
      <AddIdeaForm
        fields={fields}
        vocabulary={vocabulary}
        initialQuestion={draft?.question ?? ""}
        initialAnswer={draft?.answer ?? ""}
        focus={focus}
      />
    </div>
  );
}
