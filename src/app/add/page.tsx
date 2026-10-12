import type { Metadata } from "next";
import { loadFieldsForCapture } from "@/lib/queries";
import { EMPTY_WORD_MODEL, loadWordModel } from "@/lib/vocabulary";
import type { WordModelWire } from "@/lib/word-model";
import { loadDailyFocus } from "@/lib/daily-focus";
import { loadProgression } from "@/lib/skill-effects";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/user";
import { ideaDraftContent, validDraftId } from "@/lib/idea-filing";
import { AddIdeaForm, type AddFormField } from "@/components/AddIdeaForm";
import { Chip } from "@/components/ui/Chip";
import { addPreselectOf } from "@/components/roadmap/roadmap-links";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New idea" };

/** Enough of the split to be informative without turning the form into a chart. */
const COMPOSITION_PREVIEW_COUNT = 4;

interface IdeaDraft {
  /** The IDEA_DRAFT row: creating the idea archives it (the draftId rule in ideas.ts). */
  id: string;
  question: string;
  answer: string;
}

/**
 * An 'idea: …' line from the capture sheet, waiting in the Inbox. The line
 * may carry its answer after '::' ('why do bonds fall :: rates rise'), which
 * capture stores as the note; ideaDraftContent also reads drafts written
 * before that. Fails soft to no draft: a missing, archived or foreign id
 * just opens the empty form.
 */
async function loadIdeaDraft(param: string | undefined): Promise<IdeaDraft | null> {
  const id = validDraftId(param);
  if (!id) return null;
  try {
    const row = await prisma.taskTemplate.findFirst({
      where: { id, userId: getCurrentUserId(), kind: "IDEA_DRAFT", archivedAt: null },
      select: { id: true, title: true, note: true, rawText: true },
    });
    if (!row) return null;
    return { id: row.id, ...ideaDraftContent(row) };
  } catch {
    return null;
  }
}

/** Word completion's model (lib/vocabulary.ts). Soft: a failed read is the empty model, so the form still works, unhinted. */
async function loadWords(): Promise<WordModelWire> {
  try {
    return await loadWordModel(getCurrentUserId());
  } catch {
    return EMPTY_WORD_MODEL;
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
 * the default Short fields, and creating the idea clears it from the Inbox
 * (the form passes its id; the server archives it). Without a draft, the
 * form fills itself from the capture sheet's handoff or its own autosave.
 *
 * This page stays off the `main` container (no cq-main): the word-hint strip
 * is a fixed layer rendered inside the form.
 */
export default async function AddIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { draft: draftParam, field: fieldParam, domain: domainParam } = await searchParams;
  // Domains are offered as explicit placement targets: without them an empty
  // hand-created Domain is unreachable (discovery routes by nearest Idea).
  // The word model carries the Field and Domain names itself (always eligible, from the very first Idea).
  const [rows, vocabulary, draft, focus] = await Promise.all([
    loadFieldsForCapture(),
    loadWords(),
    loadIdeaDraft(typeof draftParam === "string" ? draftParam : undefined),
    loadFocus(),
  ]);

  const fields: AddFormField[] = rows.map((f) => ({
    id: f.id,
    name: f.name,
    domains: f.domains,
    composition: f.attributes
      .filter((a) => a.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, COMPOSITION_PREVIEW_COUNT),
  }));

  // ?field=&domain= (roadmap F21: "Add a card here" and the ADD week quest): a manual
  // placement in the user's own Field and Domain. Unknown or foreign ids are ignored,
  // and dedup still decides MERGE, SATURATION or a new card.
  const preselect = addPreselectOf({ field: fieldParam, domain: domainParam }, fields);

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
            Creating this idea clears it from your Inbox.
          </p>
        </div>
      )}
      <AddIdeaForm
        fields={fields}
        vocabulary={vocabulary}
        initialQuestion={draft?.question ?? ""}
        initialAnswer={draft?.answer ?? ""}
        draftId={draft?.id}
        focus={focus}
        initialFieldId={preselect.fieldId}
        initialDomainId={preselect.domainId}
      />
    </div>
  );
}
