import { loadFieldsForCapture } from "@/lib/queries";
import { AddIdeaForm, type AddFormField } from "@/components/AddIdeaForm";

export const dynamic = "force-dynamic";

/** Enough of the split to be informative without turning the form into a chart. */
const COMPOSITION_PREVIEW_COUNT = 4;

export default async function AddIdeaPage() {
  // Domains are offered as explicit placement targets in the form. Without
  // them an empty hand-created Domain is unreachable — discovery routes by
  // nearest existing Idea, and an empty Domain has none.
  const rows = await loadFieldsForCapture();

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
          <AddIdeaForm fields={fields} />
        </div>
      </div>
    </main>
  );
}
