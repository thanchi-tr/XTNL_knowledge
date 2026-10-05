"use client";

/**
 * A drafting run's facts (F8, F9, F18 §7): "1 draft · 2 items dropped by the
 * checker · 1 matched to your library · What was dropped", and the sheet that
 * lists every report entry in words. Nothing is rewritten: a drop, a match or
 * a flag is shown with its reason, as the checker recorded it.
 *
 * Revision 4 (F-R4-20): a keys-only run says what its reply was in counts,
 * never in the model's words: "Gemini's reply: keys only · 0 words of its
 * own" (or "· 2 area names picked from your words (not checked) · 3 not
 * shown"), or "Rejected (format) · plan from your numbers". An entry for a
 * link, a name that isn't one, a rejected reply or any area suggestion is
 * never echoed (its label is redacted, and this file never shows one even if
 * a row carried it), so a gap's text appears only in its panel. A FAILED
 * Gemini run whose rows are the app's starter reads "the app (…)" with its
 * cause (fix round 2's carry-over; revision 4's fix round): "Gemini's reply
 * was rejected" (integrity REJECTED), "Gemini's reply was refused" (the
 * tripwire), else "Gemini didn't answer" — never "Drafted by gemini-…".
 *
 * ui-motion.md §3.3 screen 2 (lane R5): the draft header shows the run as
 * `variant="chip"`: a keys-only run is the integrity chip, integrityLine
 * verbatim («[pv.integrity] Gemini's reply: keys only · 0 words of its own»),
 * whose panel holds the run line; any other run reads its counts ("1 draft ·
 * 2 dropped · 1 matched") with the run line itself sr-only, read once, and in
 * an (i) for a touch user. "What was dropped" stays one tap away on both. The living page's reference column
 * keeps the full line (the default variant).
 */
import { useState } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { InfoTip } from "@/components/glyph/InfoTip";
import type { ReportEntry, RunView } from "@/lib/roadmap-types";
import { DRAFTED_BY_LABEL, FLAG_WORD, NOTE_WORD, calendarDayOf, dayWithWeekday, integrityLine, plural, shortDroppedMatched, starterWriterWords, timeLabel } from "./roadmap-copy";

/** A Gemini run whose rows are the app's own plan (it failed or was rejected, and the starter was written in its place). */
export function wroteStarter(run: Pick<RunView, "kind" | "wrote">): boolean {
  return run.kind === "GEMINI" && run.wrote === "STARTER";
}

/** The facts line's words (without the link). A starter written in a failed run's place leads with "built from your numbers". */
export function runFactsLine(run: RunView): string {
  const parts: string[] = [];
  const integrity = run.report?.integrity;
  // A rejected reply's integrity line already says "plan from your numbers".
  if (run.kind === "GEMINI" && wroteStarter(run) && integrity?.verdict !== "REJECTED") parts.push("built from your numbers");
  if (run.kind === "GEMINI") parts.push(plural(Math.max(1, run.drafts), "draft"));
  else parts.push(run.kind === "INHOUSE" ? "built from your numbers" : "written by you");
  if (integrity) parts.push(integrityLine(integrity));
  const { dropped, matched } = runCountsOf(run);
  if (dropped > 0) parts.push(`${plural(dropped, "item")} dropped by the checker`);
  if (matched > 0) parts.push(`${matched} matched to your library`);
  return parts.join(" · ");
}

/** The checker's counts on a run's line: drops (area suggestions are the integrity line's) and matches to the library. */
export function runCountsOf(run: Pick<RunView, "report">): { dropped: number; matched: number } {
  const report = run.report;
  if (!report) return { dropped: 0, matched: 0 };
  return { dropped: report.dropped.filter((e) => !silentEntry(e)).length, matched: report.flagged.filter((e) => e.code === "MATCHED_EXISTING").length };
}

/** The run line's compact form (D1): "1 draft · 2 dropped · 1 matched" (a Gemini run's drafts first); "" when it says nothing more. */
export function runFactsCompact(run: RunView): string {
  const { dropped, matched } = runCountsOf(run);
  const parts: string[] = [];
  if (run.kind === "GEMINI") parts.push(plural(Math.max(1, run.drafts), "draft"));
  if (dropped > 0 || matched > 0) parts.push(shortDroppedMatched(dropped, matched));
  return parts.join(" · ");
}

/** The integrity chip's panel: the run line, and how the reply was checked (RunTable's words). */
export function integrityPanelLine(run: RunView): string {
  return `${runFactsLine(run)}. Checked key by key against the lists issued for this run.`;
}

/** Codes whose entries never echo a label (F-R4-20 redaction): links, non-names, a rejected reply, any area suggestion. */
const REDACTED_CODES: ReadonlySet<string> = new Set(["CONTAINED_LINK", "NOT_A_NAME", "REJECTED", "NOT_IN_YOUR_WORDS"]);

/** An entry shown without its label (redaction): a GAP row or a redacted code. */
export function redactedEntry(e: Pick<ReportEntry, "kind" | "code">): boolean {
  return e.kind === "GAP" || REDACTED_CODES.has(e.code);
}

/** An area-suggestion entry counted in the integrity line and the panel's count, not listed again as a drop. */
function silentEntry(e: Pick<ReportEntry, "kind">): boolean {
  return e.kind === "GAP";
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
              {e.label && !redactedEntry(e) ? `“${e.label}” · ` : ""}
              {e.reason}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function RunFacts({
  run,
  today,
  label,
  variant = "line",
}: {
  run: RunView;
  today: string;
  /** RunTable's key in the sheet ("Latest run" when the run isn't known to be the plan's). */
  label?: string;
  /** "chip": the draft header's compact form (the integrity chip, or the counts with the line sr-only); "line": the full line. */
  variant?: "line" | "chip";
}) {
  const [open, setOpen] = useState(false);
  const report = run.report;
  const seconds = run.finishedAt ? Math.max(0, (new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000) : null;
  const entries = Boolean(report && (report.dropped.length > 0 || report.flagged.length > 0 || report.notes.length > 0));
  const dropped = entries && (
    <>
      {" · "}
      <button type="button" className="rm-ilink" onClick={() => setOpen(true)}>
        What was dropped
      </button>
    </>
  );
  const integrity = report?.integrity ?? null;
  const compact = variant === "chip" && !integrity ? runFactsCompact(run) : "";
  return (
    <>
      {variant === "chip" && integrity ? (
        <span className="rm-rf">
          <HonestyChip kind="integrity" label={integrityLine(integrity)} full={integrityPanelLine(run)} wrap />
          {entries && (
            <button type="button" className="rm-ilink" onClick={() => setOpen(true)}>
              What was dropped
            </button>
          )}
        </span>
      ) : variant === "chip" ? (
        <span className="rm-rf">
          {compact && <span aria-hidden="true">{compact}</span>}
          <span className="sr-only">{runFactsLine(run)}</span>
          {/* The line itself one tap away for a touch user (D13). */}
          <InfoTip topic="this run">{runFactsLine(run)}</InfoTip>
          {dropped}
        </span>
      ) : (
        <span>
          {runFactsLine(run)}
          {dropped}
        </span>
      )}
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
        <span className="rm-tp-v t-mono">{wroteStarter(run) ? starterWriterWords(run) : run.kind === "GEMINI" ? (run.modelVersion ?? run.model ?? "Gemini") : run.kind === "INHOUSE" ? "the app" : "you"}</span>
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
        {run.report?.integrity && <span className="rm-tp-s">{integrityLine(run.report.integrity)} · checked key by key against the lists issued for this run</span>}
      </div>
    </div>
  );
}
