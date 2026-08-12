import { loadFieldTree } from "@/lib/queries";
import { displayQuestion } from "@/lib/idea-display";
import { loadBossStates } from "@/lib/bosses";
import { getCurrentUserId } from "@/lib/user";
import { WorkspaceView, type WorkspaceField } from "@/components/workspace/WorkspaceView";

// Due-ness changes by the second (dueDate <= now) — never let this be
// statically cached/prerendered.
export const dynamic = "force-dynamic";

function formatDue(dueDate: Date, now: Date): { label: string; overdue: boolean } {
  const diffDays = Math.round((dueDate.getTime() - now.getTime()) / 86_400_000);
  if (diffDays < 0) {
    return { label: `Overdue ${Math.abs(diffDays)}d`, overdue: true };
  }
  if (diffDays === 0) {
    return { label: "Due today", overdue: false };
  }
  return { label: `Due in ${diffDays}d`, overdue: false };
}

export default async function WorkspacePage() {
  const now = new Date();

  // One shared, cached read of the Field tree rather than a bespoke query —
  // the Dashboard wants the same rows, so whichever page is visited second
  // pays nothing. Due-filtering moves into memory below: it is a comparison
  // over a few dozen rows, and pushing it to SQL would cost a round trip
  // (~816ms) to save microseconds.
  const [allFields, bosses] = await Promise.all([loadFieldTree(), loadBossStates(getCurrentUserId())]);

  const fields = allFields.map((field) => ({
    ...field,
    domains: field.domains.map((domain) => ({
      ...domain,
      ideas: domain.ideas.filter((idea) => idea.dueDate <= now),
    })),
  }));

  const allFieldNames = fields.map((f) => f.name);

  const fieldsWithDue: WorkspaceField[] = fields
    .map((field) => ({
      id: field.id,
      name: field.name,
      level: field.level,
      domains: field.domains
        .filter((d) => d.ideas.length > 0)
        .map((domain) => ({
          id: domain.id,
          name: domain.name,
          level: domain.level,
          totalPoints: domain.totalPoints,
          ideas: domain.ideas.map((idea) => {
            const due = formatDue(idea.dueDate, now);
            return {
              id: idea.id,
              level: idea.level,
              questionType: idea.questionType,
              question: idea.question,
              preview: displayQuestion(idea.questionType, idea.question),
              dueLabel: due.label,
              overdue: due.overdue,
            };
          }),
        })),
    }))
    .filter((field) => field.domains.length > 0);

  const totalDue = fieldsWithDue.reduce((sum, f) => sum + f.domains.reduce((s, d) => s + d.ideas.length, 0), 0);

  const overdueCount = fieldsWithDue.reduce(
    (sum, f) => sum + f.domains.reduce((s, d) => s + d.ideas.filter((i) => i.overdue).length, 0),
    0
  );

  return (
    <main className="site-container flex-1 py-8">
      <header className="fade-up mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="section-eyebrow">Review</p>
          <h1 className="mt-1.5 flex items-baseline gap-2">
            <span
              className="mono"
              style={{
                fontSize: 26,
                fontWeight: 800,
                lineHeight: 1,
                color: totalDue > 0 ? "var(--amber)" : "var(--ink-2)",
              }}
            >
              {totalDue}
            </span>
            <span className="text-[15px] font-medium" style={{ color: "var(--ink-1)" }}>
              idea{totalDue === 1 ? "" : "s"} due
            </span>
          </h1>
        </div>
        {overdueCount > 0 && <span className="chip chip-red">{overdueCount} overdue</span>}
      </header>

      <div className="fade-up fade-up-1">
        <WorkspaceView
          fieldsWithDue={fieldsWithDue}
          allFieldNames={allFieldNames}
          totalDue={totalDue}
          bosses={bosses}
        />
      </div>
    </main>
  );
}
