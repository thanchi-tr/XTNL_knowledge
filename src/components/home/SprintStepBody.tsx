import { MAIN_QUEST, SPRINT, SPRINT_STEP_NOTE, milestoneHeadOf, sprintCountLine, sprintReviewLine, type SprintStep } from "@/lib/main-quest";
import { MilestoneTitle } from "@/components/today/MilestoneTitle";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

/**
 * The weekly review's Sprint step (blueprint P15; D11, D12), the main quest's: its words, its milestone (the title with
 * its struck numbers and, for Gemini's words, their chip: MilestoneTitle, as on Today's card), its one line, the
 * reviewed week's sprint line (lib/main-quest sprintReviewLine: the written figures, "provisional · final Wed 04:00"
 * until they are, "held this week", or "No sprint for this quest that week."), this week's rows with their count
 * lines, the "count, never a verdict" note and one link to its roadmap (Start and every plan edit live there).
 *
 * Read only and presentational: no hook, no write, no tick, no Start, never red. The runner (WeekReview) draws it only
 * when lib/main-quest sprintStepOf found something to show; /dev/style/today draws it as a fixture.
 */
export function SprintStepBody({ sprint, eyebrow }: { sprint: SprintStep; eyebrow: string }) {
  const { quest, reviewed } = sprint;
  const now = quest.sprint && quest.sprint.state === "OPEN" ? quest.sprint : null;
  const m = quest.milestone;
  return (
    <>
      <p className="t-eyebrow">{eyebrow}</p>
      <h1>{quest.title ?? MAIN_QUEST}</h1>
      {m && (
        <p className="t-meta">
          <MilestoneTitle m={{ head: milestoneHeadOf(m), title: m.title.trim() ? m.title : "", titleClass: m.titleClass, titleStruck: m.titleStruck }} />
        </p>
      )}
      <p className="t-meta">{quest.line}</p>
      <section aria-label={`The sprint, ${reviewed.label}`} className="card y-list" style={{ padding: "0 14px" }}>
        <div className="y-row">
          <div className="n">
            <b>{reviewed.label}</b>
            <span>{sprintReviewLine(reviewed)}</span>
          </div>
        </div>
      </section>
      {now && now.rows.length > 0 && (
        <section aria-label={SPRINT} className="card y-list" style={{ padding: "0 14px" }}>
          {now.weekStart !== reviewed.weekStart && (
            <div className="y-row">
              <div className="n">
                <b>{SPRINT}</b>
                <span>{sprintCountLine(now.done, now.total)}</span>
              </div>
            </div>
          )}
          {now.rows.map((r, i) => (
            <div key={`${r.kind}:${i}`} className="y-row">
              <div className="n">
                <b>{r.label}</b>
                <span>{r.countLine}</span>
              </div>
              {r.done && <Chip tone="kept">Done</Chip>}
            </div>
          ))}
        </section>
      )}
      <p className="t-meta">{SPRINT_STEP_NOTE}</p>
      <div>
        <Button variant="secondary" href={quest.href}>
          Open roadmap
        </Button>
      </div>
    </>
  );
}
