"use client";

/**
 * "Add a figure" on an accepted roadmap (F18 §1 Aim check; final-roadmap.html):
 * the aim check's own figure, "Hours this usually takes" and where it comes
 * from, saved through R4's setAimFigure (DRAFT or ACTIVE; the figure is the
 * user's, YOURS, and the app never checks it). A DRAFT edits the intake's
 * Reality check instead (ChecksPanel's link). Fields as the intake's: a whole
 * 1–5000 h and a source of at most 120 characters, re-checked on the server.
 */
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { ActionError } from "@/components/home/ActionError";
import { SOURCE_NOTE_MAX, TYPICAL_HOURS_MAX, TYPICAL_HOURS_MIN } from "@/lib/roadmap-types";
import { AIM_FIGURE_HOURS_LABEL, AIM_FIGURE_NOTE, AIM_FIGURE_SOURCE_LABEL } from "./roadmap-copy";
import { aimFigureOf } from "./roadmap-ui-model";
import { useRoadmapAction } from "./roadmap-runtime";

export function AimFigureSheet({ open, onClose, roadmapId }: { open: boolean; onClose: () => void; roadmapId: string }) {
  const [hours, setHours] = useState("");
  const [source, setSource] = useState("");
  const [problem, setProblem] = useState<{ field: "hours" | "source"; error: string } | null>(null);
  const { run, pending, error } = useRoadmapAction();
  const hoursId = useId();
  const sourceId = useId();
  const ids = { hours: hoursId, source: sourceId };
  const save = () => {
    const f = aimFigureOf(hours, source);
    if (!f.ok) {
      setProblem({ field: f.field, error: f.error });
      return;
    }
    setProblem(null);
    run((a) => a.setAimFigure(roadmapId, f.hours, f.source), () => onClose());
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add a figure" description={AIM_FIGURE_NOTE}>
      <div className="rm-form">
        <div className="rm-f">
          <label className="st-label" htmlFor={ids.hours}>
            {AIM_FIGURE_HOURS_LABEL}{" "}
            <span className="rm-opt">
              {TYPICAL_HOURS_MIN} to {TYPICAL_HOURS_MAX}
            </span>
          </label>
          <input id={ids.hours} className="st-input rm-num" inputMode="numeric" placeholder="e.g. 1500" value={hours} onChange={(e) => setHours(e.target.value.replace(/[^\d]/g, ""))} />
          {problem?.field === "hours" && <p className="t-error">{problem.error}</p>}
        </div>
        <div className="rm-f">
          <label className="st-label" htmlFor={ids.source}>
            {AIM_FIGURE_SOURCE_LABEL}
            <span className="rm-count">
              {source.length} / {SOURCE_NOTE_MAX}
            </span>
          </label>
          <input id={ids.source} className="st-input" maxLength={SOURCE_NOTE_MAX} placeholder="A source you trust" value={source} onChange={(e) => setSource(e.target.value)} />
          {problem?.field === "source" && <p className="t-error">{problem.error}</p>}
        </div>
        {error && <ActionError>{error}</ActionError>}
        <Button variant="primary" size="lg" block disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save the figure"}
        </Button>
      </div>
    </Sheet>
  );
}

/** The inline "Add a figure" (a 40 px link-styled button) with its sheet. */
export function AddFigureLink({ roadmapId }: { roadmapId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="rm-ilink" onClick={() => setOpen(true)}>
        Add a figure
      </button>
      <AimFigureSheet open={open} onClose={() => setOpen(false)} roadmapId={roadmapId} />
    </>
  );
}
