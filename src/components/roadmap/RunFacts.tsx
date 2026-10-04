"use client";

/**
 * A drafting run's facts (F8, F9, F18 §7): "1 draft · 2 items dropped by the
 * checker · 1 matched to your library · What was dropped", and the sheet that
 * lists every report entry in words. Nothing is rewritten: a drop, a match or
 * a flag is shown with its reason, as the checker recorded it.
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import type { ReportEntry, RunView } from "@/lib/roadmap-types";
import { DRAFTED_BY_LABEL, FLAG_WORD, NOTE_WORD, calendarDayOf, dayWithWeekday, plural, timeLabel } from "./roadmap-copy";

/** The facts line's words (without the link). */
export function runFactsLine(run: RunView): string {
  const parts: string[] = [];
  if (run.kind === "GEMINI") parts.push(plural(Math.max(1, run.drafts), "draft"));
  else parts.push(run.kind === "INHOUSE" ? "built from your numbers" : "written by you");
  const report = run.report;
  if (report) {
    const dropped = report.dropped.length;
    const matched = report.flagged.filter((e) => e.code === "MATCHED_EXISTING").length;
    if (dropped > 0) parts.push(`${plural(dropped, "item")} dropped by the checker`);
    if (matched > 0) parts.push(`${matched} matched to your library`);
  }
  return parts.join(" · ");
}

function entryCode(e: ReportEntry): string {
  if (e.code in FLAG_WORD) return FLAG_WORD[e.code as keyof typeof FLAG_WORD];
  if (e.code in NOTE_WORD) return NOTE_WORD[e.code as keyof typeof NOTE_WORD];
  return "Dropped";
}

function where(e: ReportEntry): string {
  const kind = e.kind === "DRAFT" ? "the draft" : e.kind === "MILESTONE" ? "a milestone" : `a ${e.kind.toLowerCase()}`;
  return e.milestoneOrd > 0 ? `milestone ${e.milestoneOrd} · ${kind}` : kind;
}

function Entries({ title, entries }: { title: string; entries: readonly ReportEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <>
      <span className="t-eyebrow rm-sheet-eyebrow">{title}</span>
      <ul className="card rm-oi-list" style={{ background: "var(--raised)" }}>
        {entries.map((e, i) => (
          <li key={i} className="trk-row" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
            <b style={{ fontWeight: 600 }}>
              {entryCode(e)} · {where(e)}
            </b>
            <span className="t-meta">
              {e.label ? `“${e.label}” · ` : ""}
              {e.reason}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RunFacts({ run, today, label }: { run: RunView; today: string; /** RunTable's key in the sheet ("Latest run" when the run isn't known to be the plan's). */ label?: string }) {
  const [open, setOpen] = useState(false);
  const report = run.report;
  const seconds = run.finishedAt ? Math.max(0, (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null;
  return (
    <>
      <span>
        {runFactsLine(run)}
        {report && (report.dropped.length > 0 || report.flagged.length > 0 || report.notes.length > 0) && (
          <>
            {" · "}
            <button type="button" className="rm-ilink" onClick={() => setOpen(true)}>
              What was dropped
            </button>
          </>
        )}
      </span>
      <Sheet open={open} onClose={() => setOpen(false)} title="What the checker did" description="Every drop, match and flag, in words. Nothing is rewritten.">
        {report && (
          <>
            <Entries title="Dropped" entries={report.dropped} />
            <Entries title="Flagged" entries={report.flagged} />
            <Entries title="Notes" entries={report.notes} />
          </>
        )}
        <RunTable run={run} today={today} seconds={seconds} label={label} />
      </Sheet>
    </>
  );
}

/**
 * The run's own record (How this was drafted). `label` names what the run is:
 * "Drafted by" for the run behind the plan on screen (the default; on the
 * living roadmap RoadmapView.acceptedRun), "Latest run" when the view can't
 * say which run wrote the accepted plan.
 */
export function RunTable({ run, today, seconds, label = DRAFTED_BY_LABEL }: { run: RunView; today: string; seconds?: number | null; label?: string }) {
  const secs = seconds ?? (run.finishedAt ? Math.max(0, (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null);
  // The date in the life zone, beside a time shown in the life zone (never the UTC string's own date).
  const day = calendarDayOf(run.startedAt) ?? run.startedAt.slice(0, 10);
  return (
    <div className="card rm-tp" style={{ marginTop: 12, background: "var(--raised)" }}>
      <div>
        <span className="rm-tp-k">{label}</span>
        <span className="rm-tp-v t-mono">{run.kind === "GEMINI" ? (run.modelVersion ?? run.model ?? "Gemini") : run.kind === "INHOUSE" ? "the app" : "you"}</span>
        <span className="rm-tp-s">
          {run.promptVersion != null ? `prompt v${run.promptVersion} · ` : ""}
          {dayWithWeekday(day, today)} {timeLabel(run.startedAt)}
          {run.kind === "GEMINI" ? ` · ${plural(Math.max(1, run.drafts), "draft")}` : ""}
        </span>
      </div>
      <div>
        <span className="rm-tp-k">Finished</span>
        <span className="rm-tp-v">
          {run.status === "OK" || run.status === "PARTIAL" || run.status === "REUSED" ? "Yes" : run.status === "RUNNING" ? "Still running" : "No"}
          {secs != null ? ` · ${secs.toFixed(1)} s` : ""}
        </span>
        {run.error && <span className="rm-tp-s">{run.error}</span>}
      </div>
    </div>
  );
}
