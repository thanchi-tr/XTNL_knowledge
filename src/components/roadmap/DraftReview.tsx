"use client";

/**
 * The DRAFT state of /you/roadmap (lane R5; F8 page states, F9;
 * final-roadmap-draft.html): review, edit and accept. The same review sits
 * above Now for an ACTIVE roadmap's pending re-plan (version + 1, mode
 * "replan": "Re-plan draft · not accepted yet"), with its own Accept and
 * Discard (the contract §9.3).
 *
 *   Header: "Gemini suggested the words. Every number here is worked out by
 *   the app from your records or typed by you." (or "Built from your
 *   numbers."; a re-plan reads "Re-fitted from your accepted plan." or
 *   "Edited from your accepted plan.", plus "Gemini's words stay marked."
 *   while any row is), keyed on who wrote the rows on screen (RunView.wrote),
 *   never on the latest run, which may be CAPPED or FAILED with nothing
 *   written; the run's facts with "What was dropped", the constraints line,
 *   "Not in this plan yet: S4" with [Add S4 as a topic], Edit the intake ·
 *   Draft again, and Discard on its own line (a mis-tap on Draft again
 *   spends a daily draft).
 *   The alarm banner above half flagged; the credential line with [Paste the
 *   syllabus]; the non-English line.
 *   The next milestone expanded (decided now); later ones as an outline.
 *   A sticky footer that is never a dead disabled button: "Accept plan ·
 *   milestone 1 ready · 2 in outline", or "Next item to decide" (it scrolls
 *   there), or "Fix milestone 1 first".
 *
 * Accept writes the first readings and the acceptance; its toast offers Undo
 * for ACCEPT_UNDO_MS. Discard is quiet, with an undo toast.
 *
 * The RUNNING state is static text in an aria-live region (no spinner, no
 * shimmer); the page refreshes every DRAFT_REFRESH_MS for at most
 * DRAFT_REFRESH_MAX_MS, and a run older than RUN_STALE_MS reads "Drafting
 * stopped (timed out)" with [Build from my numbers] and [Try again].
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader, Switch } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import {
  ACCEPT_UNDO_MS,
  DRAFT_REFRESH_MAX_MS,
  DRAFT_REFRESH_MS,
  RUN_STALE_MS,
  type MilestoneDraft,
  type RoadmapHeader,
  type RoadmapView,
  type RunView,
  type RunWriter,
} from "@/lib/roadmap-types";
import {
  BUILT_LEAD_LINE,
  CONSTRAINTS_LINE,
  CREDENTIAL_LINE,
  GEMINI_LEAD_LINE,
  INTENSITY_WORD,
  REPLAN_EDITED_LINE,
  REPLAN_EYEBROW,
  REPLAN_GEMINI_LINE,
  REPLAN_REFIT_LINE,
  TIME_FIXED_LINE,
  TRACK_WORD,
  addAsTopicWord,
  byLine,
  plural,
  timeSecondsLabel,
  uncoveredLine,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF } from "./roadmap-links";
import { carriedRowsOf, domainIndexOf, draftBannerOf, draftHasGeminiWords, draftRunWriterOf, rankPlanOf, rowDomId, scheduledOf, undecidedOf } from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { ItemEditor, type ItemEditorScope } from "./ItemEditor";
import { MilestoneCard, type MilestoneCardContext } from "./MilestoneCard";
import { RunFacts } from "./RunFacts";
import { AreaChipView } from "./AimCard";
import { RoadmapGlyph } from "./RoadmapGlyph";
import "./roadmap.css";

/** The editor's scope from the view (the label checks' context and the Domain sheets' library). */
export function editorScopeOf(view: RoadmapView, milestones: readonly MilestoneDraft[]): ItemEditorScope | null {
  const h = view.header;
  if (!h) return null;
  const syllabusLines = milestones.flatMap((m) => m.items.filter((it) => it.kind === "TOPIC" && it.origin === "SYLLABUS").map((it) => it.label));
  return {
    roadmapId: h.id,
    aim: h.aim,
    constraints: h.constraints,
    examLabel: h.examLabel,
    areaName: h.area.kind === "FIELD" ? h.area.name : TRACK_WORD[h.track],
    areaFieldId: h.area.kind === "FIELD" ? h.area.fieldId : null,
    track: h.track,
    library: view.library,
    syllabusLines,
    milestoneCount: scheduledOf(milestones).length,
    today: view.today,
  };
}

function scrollToRow(id: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(rowDomId(id));
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  const focusable = el.querySelector<HTMLElement>("button, a, input");
  focusable?.focus({ preventScroll: true });
}

/** RunFacts adds to the lead line only for a Gemini run or a report with entries ("built from your numbers" is the lead already). */
function runSaysMore(run: RunView): boolean {
  const r = run.report;
  return run.kind === "GEMINI" || Boolean(r && (r.dropped.length > 0 || r.flagged.length > 0 || r.notes.length > 0));
}

/**
 * The eyebrow and the lead line by who wrote the rows on screen (F9 Header;
 * the contract §11.2). A re-plan's rows start from the accepted plan: one the
 * app re-fitted (INHOUSE) reads "Re-fitted from your accepted plan.", one the
 * user edited (MANUAL) "Edited from your accepted plan.", and while any row
 * is still Gemini's words (`geminiWords`) the line adds "Gemini's words stay
 * marked." — never "Built from your numbers." over rows Gemini wrote.
 */
export function draftLeadOf(writer: RunWriter | null, mode: "draft" | "replan", nonEnglish: boolean, geminiWords = false): { eyebrow: string; lead: string | null } {
  const eyebrow =
    mode === "replan" ? REPLAN_EYEBROW : writer === "GEMINI" ? "Draft · not accepted yet" : writer === "MANUAL" ? "Draft · written by you" : writer ? "Draft · built from your numbers" : "Draft · not accepted yet";
  if (nonEnglish && writer === "GEMINI") return { eyebrow, lead: "Gemini's labels are in your language; the app's checks read English only, so each needs your tap." };
  if (mode === "replan" && writer && writer !== "GEMINI") {
    const base = writer === "INHOUSE" ? REPLAN_REFIT_LINE : writer === "MANUAL" ? REPLAN_EDITED_LINE : BUILT_LEAD_LINE;
    return { eyebrow, lead: geminiWords ? `${base} ${REPLAN_GEMINI_LINE}` : base };
  }
  // A view with no run that wrote rows claims nothing about who wrote them.
  return { eyebrow, lead: writer === "GEMINI" ? GEMINI_LEAD_LINE : writer ? BUILT_LEAD_LINE : null };
}

/**
 * "Not in this plan yet: S4, S9" with [Add as topic] for each line (F6 step
 * 8): R4's addItem with the line's syllabusRef puts the user's own line, whole,
 * into the next milestone as a topic (origin SYLLABUS, YOURS). Without a
 * persisted next milestone the line is shown alone.
 */
export function UncoveredSyllabus({ indices, milestoneId, ord }: { indices: readonly number[]; milestoneId: string | null; ord: number | null }) {
  const { run, pending, error } = useRoadmapAction();
  const line = uncoveredLine(indices);
  if (!line) return null;
  return (
    <div>
      <span>{line}</span>
      {milestoneId && (
        <div className="rm-acts" style={{ marginTop: 6 }}>
          {indices.map((i) => (
            <ChipButton
              key={i}
              disabled={pending}
              aria-label={`${addAsTopicWord(i)} in milestone ${ord ?? 1}`}
              onClick={() => run((a) => a.addItem(milestoneId, { kind: "TOPIC", syllabusRef: i }))}
            >
              {addAsTopicWord(i)}
            </ChipButton>
          ))}
        </div>
      )}
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

/** The draft's header card (a DRAFT roadmap), or the re-plan's (an ACTIVE roadmap's version + 1). */
function DraftHeader({ header, run, view, mode, next }: { header: RoadmapHeader; run: RunView | null; view: RoadmapView; mode: "draft" | "replan"; next: MilestoneDraft | null }) {
  const { run: act, pending, error, runtime } = useRoadmapAction();
  const draft = view.draft!;
  const writer = draftRunWriterOf(run);
  const { eyebrow, lead } = draftLeadOf(writer, mode, draft.nonEnglish, draftHasGeminiWords(draft.milestones));
  const capped = run?.capped === true || run?.status === "CAPPED";
  const uncovered = draft.uncoveredSyllabus.length > 0 ? <UncoveredSyllabus indices={draft.uncoveredSyllabus} milestoneId={next?.id ?? null} ord={next?.ord ?? null} /> : null;
  const discard = () =>
    act(
      (a) => a.discardDraft(header.id),
      () =>
        pushToast({
          title: mode === "replan" ? "Re-plan discarded" : "Draft discarded",
          body: mode === "replan" ? "Your accepted plan is unchanged." : "Nothing was on Today.",
          action: { label: "Undo", onAction: () => void runtime.actions.undoDiscard(header.id).then(() => runtime.refresh()) },
        })
    );
  if (mode === "replan") {
    const ords = draft.milestones.map((m) => m.ord);
    const first = ords.length > 0 ? Math.min(...ords) : null;
    const last = ords.length > 0 ? Math.max(...ords) : null;
    return (
      <section className="card rm-aim" aria-label="The re-plan draft">
        <div className="t-eyebrow">{eyebrow}</div>
        <p className="rm-lead" style={{ marginTop: 6 }}>
          Version {draft.version}
          {first != null && last != null ? ` · ${first === last ? `Milestone ${first}` : `Milestones ${first} to ${last}`}` : ""}. Started milestones stay as they are.
        </p>
        {lead && <p className="rm-lead">{lead}</p>}
        <div className="rm-lines">
          {run && runSaysMore(run) && <RunFacts run={run} today={view.today} />}
          {uncovered}
        </div>
        <div className="rm-acts">
          <ChipButton disabled={pending} onClick={discard}>
            Discard the re-plan
          </ChipButton>
        </div>
        {error && <ActionError>{error}</ActionError>}
      </section>
    );
  }
  return (
    <section className="card rm-aim" aria-label="The draft">
      <div className="t-eyebrow">{eyebrow}</div>
      <p className="rm-aim-t">{header.aim}</p>
      <div className="rm-chips">
        <AreaChipView area={header.area} />
        <Chip>{byLine(header.targetDay, view.today, false)}</Chip>
        <Chip>
          {header.hoursPerWeek} h a week · {INTENSITY_WORD[header.intensity]}
        </Chip>
        {header.examLabel && <Chip>Exam: {header.examLabel}</Chip>}
      </div>
      {lead && <p className="rm-lead">{lead}</p>}
      <div className="rm-lines">
        {run && runSaysMore(run) && <RunFacts run={run} today={view.today} />}
        {header.constraints && <span>{CONSTRAINTS_LINE}</span>}
        {uncovered}
        <span>
          <Link className="rm-ilink" href={ROADMAP_NEW_HREF}>
            Edit the intake
          </Link>
          {view.hasKey && writer === "GEMINI" && !capped && (
            <>
              {" · "}
              <button type="button" className="rm-ilink" disabled={pending} onClick={() => act((a) => a.redraft(header.id))}>
                Draft again
              </button>{" "}
              (may return a similar draft)
            </>
          )}
        </span>
      </div>
      {/* Discard on its own line, a full target away from Draft again. */}
      <div className="rm-acts">
        <ChipButton disabled={pending} onClick={discard}>
          Discard the draft
        </ChipButton>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}

function DraftFooter({ view, next, outlineCount, mode }: { view: RoadmapView; next: MilestoneDraft | null; outlineCount: number; mode: "draft" | "replan" }) {
  const draft = view.draft!;
  const header = view.header!;
  const { run, pending, error, runtime } = useRoadmapAction();
  const [over, setOver] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const undecided = next ? undecidedOf(next) : [];
  const f = draft.feasibility;
  const impossibleMs = f.milestones.find((x) => x.worst === "IMPOSSIBLE");
  const nextId = draft.nextToDecide ?? undecided[0]?.id ?? null;

  if (f.impossible && impossibleMs) {
    const ms = draft.milestones.find((x) => x.lineageId === impossibleMs.lineageId);
    return (
      <div className="rm-sticky">
        <Button variant="primary" size="lg" onClick={() => ms && scrollToRow(ms.id ?? ms.lineageId)}>
          Fix milestone {impossibleMs.ord} first
        </Button>
        <p className="t-meta">Accept is offered once no milestone is Impossible.</p>
      </div>
    );
  }

  if (!draft.acceptable && nextId) {
    return (
      <div className="rm-sticky">
        <Button variant="primary" size="lg" onClick={() => scrollToRow(nextId)}>
          Next item to decide
        </Button>
        <p className="t-meta">
          {next ? `${plural(undecided.length, "item")} left in milestone ${next.ord}. ` : ""}
          {outlineCount > 0 ? `${outlineCount === 1 ? "The other milestone stays" : "The other milestones stay"} an outline; you decide their items when you start each one.` : ""}
        </p>
      </div>
    );
  }

  if (!draft.acceptable && next && next.measures.every((x) => x.role !== "PAYS")) {
    return (
      <div className="rm-sticky">
        <Button variant="primary" size="lg" onClick={() => document.getElementById(`rm-add-${next.id}`)?.scrollIntoView({ block: "center" })}>
          Add to milestone {next.ord}
        </Button>
        <p className="t-meta">No measurable part yet — add a Domain or a practice to milestone {next.ord}, then accept.</p>
      </div>
    );
  }

  const accept = () => {
    if (f.over && !over) {
      setHint("Turn on “Keep it over my hours/pace” first: this plan asks more than your hours or pace.");
      return;
    }
    setHint(null);
    run(
      (a) => a.acceptPlan(header.id, { overAccepted: over }),
      (v) =>
        pushToast({
          title: "Plan accepted",
          body: mode === "replan" ? `Version ${v.version}. Started milestones stay as they are.` : `Version ${v.version}. Nothing is on Today until you start milestone ${next?.ord ?? 1}.`,
          holdMs: ACCEPT_UNDO_MS,
          action: { label: "Undo", onAction: () => void runtime.actions.undoAccept(header.id, v.version).then(() => runtime.refresh()) },
        })
    );
  };

  return (
    <div className="rm-sticky">
      {f.over && (
        <div className="rm-sw" style={{ flexBasis: "100%" }}>
          <span className="rm-sw-t">Keep it over my hours/pace</span>
          <Switch checked={over} onChange={setOver} label="Keep it over my hours/pace" />
        </div>
      )}
      <Button variant="primary" size="lg" onClick={accept} disabled={pending}>
        {pending ? "Accepting…" : "Accept plan"}
      </Button>
      <p className="t-meta">
        Milestone {next?.ord ?? 1} ready{outlineCount > 0 ? ` · ${outlineCount} in outline` : ""}.{f.over ? " Kept over, it shows a quiet “Over” chip for good." : ""}
      </p>
      {hint && (
        <p className="t-error" role="alert">
          {hint}
        </p>
      )}
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

export function DraftReview({ view, mode = "draft" }: { view: RoadmapView; /** "replan": an ACTIVE roadmap's version + 1, shown above Now. */ mode?: "draft" | "replan" }) {
  const draft = view.draft;
  const header = view.header;
  const index = useMemo(() => domainIndexOf(view), [view]);
  const scope = useMemo(() => (draft ? editorScopeOf(view, draft.milestones) : null), [view, draft]);
  if (!draft || !header || !scope) return null;

  const sched = scheduledOf(draft.milestones);
  const next = draft.milestones.find((m) => m.lineageId === draft.nextLineageId) ?? sched.find((m) => m.status === "DRAFT") ?? sched[0] ?? null;
  const outline = draft.milestones.filter((m) => m !== next).sort((a, b) => a.ord - b.ord);
  // A re-plan's milestones take their places after the carried ones (one place per lineage).
  const carried = mode === "replan" ? carriedRowsOf(view.milestones) : [];
  const ranks = rankPlanOf(draft.milestones, carried);
  const mfOf = (m: MilestoneDraft) => draft.feasibility.milestones.find((x) => x.lineageId === m.lineageId) ?? null;
  const ctx: MilestoneCardContext = {
    roadmapId: header.id,
    today: view.today,
    intensity: header.intensity,
    m: draft.feasibility.m,
    targetDay: header.targetDay,
    domainIndex: index,
    credentialNoSyllabus: draft.credential && !header.hasSyllabus,
    bulkKeepOff: draft.bulkKeepOff,
    throughput: view.throughput,
    hoursPerWeek: header.hoursPerWeek,
    milestoneCount: new Set(carried.map((c) => c.lineageId)).size + sched.length,
    // A re-plan's roadmap is ACTIVE: its intake is closed, so the checks' "Add a figure" opens the figure sheet.
    intakeEditable: mode === "draft",
  };
  // The banner names what happened to the latest run; who wrote the rows is the header's (RunView.wrote).
  const banner = mode === "draft" ? draftBannerOf(view.run) : null;
  const outlineRange = outline.length > 0 ? (outline.length === 1 ? `Milestone ${outline[0].ord}` : `Milestones ${outline[0].ord}–${outline[outline.length - 1].ord}`) : null;

  return (
    <ItemEditor scope={scope}>
      <div className="rm-stack">
        {banner && (
          <section className="card rm-note">
            <RoadmapGlyph name="info" />
            <span>{banner}</span>
          </section>
        )}
        <DraftHeader header={header} run={view.run} view={view} mode={mode} next={next} />
        {draft.alarm && (
          <section className="card rm-note">
            <Icon name="flag" />
            <span>
              <b>Most of this draft needs your check.</b>
            </span>
          </section>
        )}
        {ctx.credentialNoSyllabus && mode === "draft" && (
          <section className="card rm-banner">
            <p className="rm-banner-t">
              <b>{CREDENTIAL_LINE}</b>
            </p>
            <Button href={`${ROADMAP_NEW_HREF}#syllabus`}>Paste the syllabus</Button>
          </section>
        )}
        <div className="rm-grid">
          <div>
            {next && (
              <>
                <SectionHeader title={`Next · milestone ${next.ord}${mode === "draft" ? ` of ${sched.length}` : ""}`} aside="decide now" />
                <MilestoneCard milestone={next} stage="draft" mf={mfOf(next)} rank={ranks[next.id ?? next.lineageId]} aimCheck={draft.feasibility.aimCheck} ctx={ctx} />
              </>
            )}
          </div>
          {outline.length > 0 && (
            <div>
              <SectionHeader title={`${outlineRange} · outline`} aside="decide when you start each" />
              <div className="rm-stack" style={{ gap: 12 }}>
                {outline.map((m) => (
                  <MilestoneCard key={m.id ?? m.lineageId} milestone={m} stage="outline" mf={mfOf(m)} rank={ranks[m.id ?? m.lineageId]} aimCheck={null} ctx={ctx} />
                ))}
                {outline.some((m) => mfOf(m) != null) && <p className="rm-cap">{TIME_FIXED_LINE}</p>}
              </div>
            </div>
          )}
        </div>
        <DraftFooter view={view} next={next} outlineCount={outline.length} mode={mode} />
      </div>
    </ItemEditor>
  );
}

/** RUNNING (F8): static text in an aria-live region; the page refreshes from the database, for at most 75 s. */
export function DraftRunning({ view }: { view: RoadmapView }) {
  const runtime = useRoadmapRuntime();
  const { run: act, pending, error } = useRoadmapAction();
  const run = view.run!;
  const header = view.header;
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (run.stale) return;
    const t0 = Date.now();
    const started = new Date(run.startedAt).getTime();
    const id = window.setInterval(() => {
      const now = Date.now();
      if (now - started > RUN_STALE_MS) setTimedOut(true);
      if (now - t0 <= DRAFT_REFRESH_MAX_MS) runtime.refresh();
      else window.clearInterval(id);
    }, DRAFT_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [run.stale, run.id, run.startedAt, runtime]);
  const stale = run.stale || timedOut;
  return (
    <div className="rm-stack">
      {header && (
        <section className="card rm-aim">
          <div className="t-eyebrow">Draft</div>
          <p className="rm-aim-t">{header.aim}</p>
          <div className="rm-chips">
            <AreaChipView area={header.area} />
            <Chip>{byLine(header.targetDay, view.today, false)}</Chip>
          </div>
        </section>
      )}
      {stale ? (
        <section className="card rm-run">
          <Icon name="clock" />
          <div className="rm-run-body">
            <b>Drafting stopped (timed out)</b>
            <p className="t-meta" style={{ marginTop: 4 }}>
              Started {timeSecondsLabel(run.startedAt)}. It still counts toward today&apos;s drafts.
            </p>
            {header && (
              <div className="rm-acts" style={{ marginTop: 12 }}>
                <Button variant="primary" disabled={pending} onClick={() => act((a) => a.buildStarter(header.id))}>
                  Build from my numbers
                </Button>
                <Button disabled={pending} onClick={() => act((a) => a.draftRoadmap(header.id))}>
                  Try again
                </Button>
              </div>
            )}
            {error && <ActionError>{error}</ActionError>}
          </div>
        </section>
      ) : (
        <section className="card rm-run" aria-live="polite">
          <RoadmapGlyph name="route" />
          <div className="rm-run-body">
            <b>
              Drafting · {plural(Math.max(1, run.drafts), "draft")} · started {timeSecondsLabel(run.startedAt)}
            </b>
            {run.usualSeconds != null && (
              <p className="t-meta" style={{ marginTop: 4 }}>
                usually about {Math.round(run.usualSeconds)} s
              </p>
            )}
          </div>
        </section>
      )}
      {!stale && (
        <div className="card pad" aria-hidden="true">
          <span className="rm-sk" style={{ height: 22, width: "60%" }} />
          <span className="rm-sk" style={{ height: 14, width: "85%", marginTop: 12 }} />
          <span className="rm-sk" style={{ height: 14, width: "70%", marginTop: 8 }} />
          <span className="rm-sk" style={{ height: 44, marginTop: 16 }} />
        </div>
      )}
    </div>
  );
}
