"use client";

/**
 * [Re-plan] (F22; final-roadmap.html E): a re-fit to the user's numbers
 * (in-house) or by hand. Either makes a new DRAFT version of the unstarted
 * milestones only, reviewed and accepted like the first; the started
 * milestone stays as it is, and Undo brings the old plan back. A Gemini
 * re-draft of unstarted milestones is Deferred.
 */
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { useRoadmapAction } from "./roadmap-runtime";
import { RoadmapGlyph } from "./RoadmapGlyph";

export function ReplanSheet({ open, onClose, roadmapId, startedOrd }: { open: boolean; onClose: () => void; roadmapId: string; startedOrd: number | null }) {
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Re-plan the unstarted milestones"
      description={startedOrd != null ? `Milestone ${startedOrd} is started and stays as it is.` : "Nothing started is touched."}
    >
      <div className="rm-stack" style={{ gap: 10 }}>
        <button type="button" className="card rm-pick" style={{ background: "var(--raised)" }} disabled={pending} onClick={() => run((a) => a.replan(roadmapId, "REFIT"), () => onClose())}>
          <RoadmapGlyph name="route" />
          <span className="rm-pick-t">
            <b>Re-fit to my numbers</b>
            <span className="t-meta">In-house. Re-splits the dates of the unstarted milestones and re-fits levels, targets and sessions from today&apos;s cards, pace and hours. Labels and your decisions stay.</span>
          </span>
        </button>
        <button type="button" className="card rm-pick" style={{ background: "var(--raised)" }} disabled={pending} onClick={() => run((a) => a.replan(roadmapId, "MANUAL"), () => onClose())}>
          <RoadmapGlyph name="edit" />
          <span className="rm-pick-t">
            <b>Edit by hand</b>
            <span className="t-meta">The same editor and checks.</span>
          </span>
        </button>
      </div>
      <p className="t-meta" style={{ marginTop: 12 }}>
        Either path makes a new draft version you review like the first. The plan you have stays until you accept; Undo brings it back. Ranks are assigned again only for
        unstarted milestones, never above their first value.
      </p>
      {error && <ActionError>{error}</ActionError>}
    </Sheet>
  );
}
