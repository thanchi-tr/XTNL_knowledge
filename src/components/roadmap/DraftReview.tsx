"use client";

/**
 * The DRAFT state of /you/roadmap (lane R5; F8 page states, F9;
 * roadmap-rev4.md F-R4-11, F-R4-16 to F-R4-21, F-R4-24;
 * final-roadmap-draft.html): review, edit and accept. The same review sits
 * above Now for an ACTIVE roadmap's pending re-plan (version + 1, mode
 * "replan": "Re-plan draft · not accepted yet"), with its own Accept and
 * Discard (the contract §9.3).
 *
 *   Header: by who wrote the rows on screen (RunView.wrote, never the latest
 *   run's own kind): a keys-only Gemini draft "Gemini arranged your outline
 *   into milestones … It wrote none of the words …"; the app's "Built from
 *   your numbers."; a re-plan "Re-fitted from your accepted plan." or
 *   "Edited from your accepted plan."; a rev-3 Gemini draft (a legacy view
 *   never reaches here) its rev-3 line. The run's facts with "How this was
 *   drafted" ("Gemini's reply: keys only · 0 words of its own", or
 *   "Rejected (format) · plan from your numbers"), Edit the intake · Draft
 *   again (only while Gemini drafting is live), and Discard on its own line.
 *
 * A keys-only draft (revision 4) then shows, each the user's to change:
 *   - Gemini's Domain additions, decided once above the milestones, with each
 *     Domain's real counts and the date effect before anything is confirmed:
 *     [Add both] [Choose…] [Leave out] for an English, non-exam aim; one
 *     toggle per Domain and [Confirm] (no add-all) for an exam or non-English
 *     aim; a Domain past 3 years or a 7th is disabled with its reason;
 *   - the activity card (contracts §19), above the rest; on an older draft
 *     without it, the kinds the constraints left out, each with its word,
 *     [Allow one]; the aim-conflict line, quoting the user's own sentence
 *     and shown only while unresolved (decision 6); a body or care plan's
 *     one session-picks confirm;
 *   - the Depth line and the date check with its offers (Use the realistic
 *     date, Keep my date, Choose a lower depth…; nothing lowers by itself);
 *   - the arrangement line (Gemini runs only; on a v4 run, the outline's
 *     order and each practice marked as Gemini's choice);
 *   - the milestones: the next expanded and decided now, later ones as an
 *     outline; no Keep and no bulk keep; each with its "why this stage"
 *     line (contracts §20: code's progression, roadmap-ui-model stageWhysOf);
 *   - "Lines to look at": outline lines in no milestone, and lines tied to no
 *     Domain; the outline's empty state; the area-suggestion panel (only
 *     while ROADMAP_GAPS_LIVE).
 * A legacy draft never renders here (RoadmapScreen shows its banner).
 *
 * A sticky footer that is never a dead disabled button: "Accept the plan",
 * or "Next item to decide" (it scrolls to the additions, the session picks
 * or the next row), or "Fix milestone 1 first" (only for a milestone of this
 * draft, never a started one: fix round 2's carry-over), or the date's own
 * refusal. Accept's toast offers Undo for ACCEPT_UNDO_MS.
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
  DEPTH_DOMAINS_MAX,
  DRAFT_REFRESH_MAX_MS,
  DRAFT_REFRESH_MS,
  ROADMAP_GEMINI_LIVE,
  RUN_STALE_MS,
  isPracticeFamily,
  type DraftView,
  type MilestoneDraft,
  type RoadmapHeader,
  type RoadmapView,
  type RunView,
  type RunWriter,
} from "@/lib/roadmap-types";
import { catalogTrackOf, type CatalogKey } from "@/lib/roadmap-catalog";
import {
  ARRANGEMENT_LINE,
  BUILT_LEAD_LINE,
  CHOOSE_WORD,
  CONFIRM_WORD,
  CONSTRAINTS_LINE,
  CREDENTIAL_LINE,
  GEMINI_LEAD_LINE,
  GEMINI_V3_LEAD_LINE,
  GEMINI_V4_LEAD_LINE,
  HEALTH_LINE,
  INTENSITY_WORD,
  KIND_NAME,
  LEAVE_OUT_WORD,
  OUTLINE_EMPTY_EXAM_LINE,
  ADD_OUTLINE_WORD,
  REPLAN_EDITED_LINE,
  REPLAN_EYEBROW,
  REPLAN_GEMINI_LINE,
  REPLAN_REFIT_LINE,
  RUN_REJECTED_LINE,
  SESSION_PICKS_KEEP,
  TIME_FIXED_LINE,
  TRACK_WORD,
  addAllWord,
  addAsTopicWord,
  additionBlockedLine,
  additionEffectLine,
  additionsLine,
  arrangementV4Line,
  byLine,
  depthName,
  exclusionsLine,
  geminiV4LeadLine,
  outlineEmptyLine,
  paragonDepthLine,
  plural,
  sessionPicksLine,
  sessionPicksRefusalOf,
  sessionPicksSwapLine,
  sessionPicksSwapWord,
  timeSecondsLabel,
  uncoveredLine,
  unassignedLinesLine,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF } from "./roadmap-links";
import {
  activityCardOf,
  activityWaitingOf,
  additionsDatesOf,
  aimConflictLineOf,
  carriedRowsOf,
  domainIndexOf,
  draftBannerOf,
  draftHasGeminiWords,
  draftRunWriterOf,
  geminiNamedOf,
  geminiV4PartsOf,
  isHeldMilestone,
  isKeysOnlyDraft,
  pickerExcludedOf,
  picksAreChoicesOf,
  practiceOnlyLineOf,
  rankPlanOf,
  referenceRunOf,
  rowDomId,
  rowsAreProgressionOf,
  scheduledOf,
  sessionSwapKindsOf,
  stageRunOf,
  stageWhysOf,
  undecidedOf,
  type GeminiV4Parts,
} from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { ItemEditor, type ItemEditorScope } from "./ItemEditor";
import { MilestoneCard, type MilestoneCardContext } from "./MilestoneCard";
import { RunFacts } from "./RunFacts";
import { AreaChipView } from "./AimCard";
import { DepthLines } from "./AimHeader";
import { DateBlock } from "./DateBlock";
import { GapPanel, type LiveGates } from "./GapPanel";
import { RoadmapGlyph } from "./RoadmapGlyph";
import { ActivityConfirmCard, activityHealthOf } from "./ActivityConfirm";
import "./roadmap.css";

/**
 * The answers the plan's activity card reads (contracts §19): the draft's own
 * (DraftView.activityConfirm, from the gate it was built with), else the
 * living roadmap's. undefined: an older server that sends neither.
 */
export function activityConfirmOfView(view: Pick<RoadmapView, "draft" | "activityConfirm">): RoadmapView["activityConfirm"] {
  return view.draft?.activityConfirm !== undefined ? view.draft.activityConfirm : view.activityConfirm;
}

/** The editor's scope from the view (the label checks' context, the Domain sheets' library, and the type picker's exclusions). */
export function editorScopeOf(view: RoadmapView, milestones: readonly MilestoneDraft[], allowed: readonly CatalogKey[] = []): ItemEditorScope | null {
  const h = view.header;
  if (!h) return null;
  const confirm = activityConfirmOfView(view);
  const syllabusLines = milestones.flatMap((m) => m.items.filter((it) => it.kind === "TOPIC" && it.origin === "SYLLABUS").map((it) => it.label));
  return {
    roadmapId: h.id,
    aim: h.aim,
    // The practice family (contracts §20.11): the user's answer when the header carries it; else stageRunOf reads the aim's prefill.
    practiceFamily: "practiceFamily" in h && isPracticeFamily(h.practiceFamily) ? h.practiceFamily : null,
    constraints: h.constraints,
    examLabel: h.examLabel,
    areaName: h.area.kind === "FIELD" ? h.area.name : TRACK_WORD[h.track],
    areaFieldId: h.area.kind === "FIELD" ? h.area.fieldId : null,
    track: h.track,
    library: view.library,
    syllabusLines,
    milestoneCount: scheduledOf(milestones).filter((m) => !isHeldMilestone(m)).reduce((n, m) => Math.max(n, m.ord), 0),
    today: view.today,
    // Constraint safety (contracts §19): with the gate's view, the picker leaves out what the gate holds; the old exclusions otherwise.
    excluded: pickerExcludedOf(confirm, view.draft?.exclusions),
    allowed: confirm ? [] : allowed,
    held: activityWaitingOf(confirm),
    // The practice progression (contracts §20): the run that wrote these rows (the draft's latest run, else the accepted plan's) says whether Gemini's picks are choices among each stage's options.
    choices: picksAreChoicesOf(rowsRunOf(view, milestones)),
  };
}

/** The run that wrote these rows: the latest run for a draft's rows, else the run behind the accepted plan (referenceRunOf). */
function rowsRunOf(view: Pick<RoadmapView, "draft" | "run" | "acceptedRun">, milestones: readonly MilestoneDraft[]): RunView | null {
  const drafted = view.draft != null && milestones.some((m) => view.draft!.milestones.includes(m));
  return drafted ? view.run : referenceRunOf(view).run;
}

/** Scrolls to a row (or a plan-level card), focusing its first control. */
function scrollToId(domId: string) {
  if (typeof document === "undefined") return;
  const el = document.getElementById(domId);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  const focusable = el.querySelector<HTMLElement>("button, a, input");
  focusable?.focus({ preventScroll: true });
}

function scrollToRow(id: string) {
  scrollToId(rowDomId(id));
}

/** The additions card's and the session picks card's DOM ids: "Next item to decide" lands on the plan-level decision. */
export const ADDITIONS_DOM_ID = "rm-additions";
export const PICKS_DOM_ID = "rm-picks";

/**
 * Where "Next item to decide" goes (F-R4-21): R4's nextToDecide is a pending
 * addition's or session pick's item id first; those are decided once, in
 * their plan-level card, so the footer scrolls there.
 */
export function nextTargetOf(draft: Pick<DraftView, "nextToDecide" | "additions" | "sessionPicks" | "milestones">, fallback: string | null): string | null {
  const id = draft.nextToDecide ?? fallback;
  const additionIds = new Set((draft.additions ?? []).map((a) => a.itemId).filter((x): x is string => Boolean(x)));
  const pendingAdd = draft.milestones.some((m) => m.items.some((it) => it.kind === "DOMAIN" && it.origin === "GEMINI" && it.decision === "PENDING" && it.notes.includes("NOT_CHOSEN")));
  if (pendingAdd && (draft.additions?.length ?? 0) > 0 && (!id || additionIds.has(id) || draft.milestones.some((m) => m.items.some((it) => it.id === id && it.notes.includes("NOT_CHOSEN"))))) return ADDITIONS_DOM_ID;
  if (draft.sessionPicks?.decision === "PENDING" && (!id || draft.milestones.some((m) => m.items.some((it) => it.id === id && it.notes.includes("GEMINI_PICK"))))) return PICKS_DOM_ID;
  return id ? rowDomId(id) : null;
}

/** RunFacts adds to the lead line only for a Gemini run or a report with entries ("built from your numbers" is the lead already). */
function runSaysMore(run: RunView): boolean {
  const r = run.report;
  return run.kind === "GEMINI" || Boolean(r && (r.dropped.length > 0 || r.flagged.length > 0 || r.notes.length > 0 || r.integrity));
}

/** A run whose reply the integrity walk rejected (F-R4-20): the plan on screen is the app's, written in its place. */
export function runRejectedOf(run: RunView | null): boolean {
  return Boolean(run && run.kind === "GEMINI" && (run.report?.integrity?.verdict === "REJECTED" || /^reply rejected/i.test(run.error ?? "")));
}

/**
 * The eyebrow and the lead line by who wrote the rows on screen (F9 Header;
 * the contract §11.2; revision 4's keys-only header). A re-plan's rows start
 * from the accepted plan: one the app re-fitted (INHOUSE) reads "Re-fitted
 * from your accepted plan.", one the user edited (MANUAL) "Edited from your
 * accepted plan.", and while any row is still Gemini's words (`geminiWords`)
 * the line adds "Gemini's words stay marked." — never "Built from your
 * numbers." over rows Gemini wrote. A keys-only Gemini draft (`keysOnly`)
 * says Gemini wrote none of the words: from the progression on (`choices`,
 * picksAreChoicesOf; contracts §20) the v4 header names its smaller part,
 * only the parts the run asked and the reply used (`parts`, geminiV4PartsOf
 * over the draft's rows: geminiV4LeadLine; without them, every part,
 * GEMINI_V4_LEAD_LINE), and a v3 reply's draft reads GEMINI_V3_LEAD_LINE.
 */
export function draftLeadOf(
  writer: RunWriter | null,
  mode: "draft" | "replan",
  nonEnglish: boolean,
  geminiWords = false,
  keysOnly = false,
  choices = true,
  parts: GeminiV4Parts | null = null
): { eyebrow: string; lead: string | null } {
  const eyebrow =
    mode === "replan" ? REPLAN_EYEBROW : writer === "GEMINI" ? "Draft · not accepted yet" : writer === "MANUAL" ? "Draft · written by you" : writer ? "Draft · built from your numbers" : "Draft · not accepted yet";
  if (keysOnly && writer === "GEMINI") return { eyebrow, lead: choices ? (parts ? geminiV4LeadLine(parts) : GEMINI_V4_LEAD_LINE) : GEMINI_V3_LEAD_LINE };
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
function DraftHeader({ header, run, view, mode, next, keysOnly, gates }: { header: RoadmapHeader; run: RunView | null; view: RoadmapView; mode: "draft" | "replan"; next: MilestoneDraft | null; keysOnly: boolean; gates?: LiveGates }) {
  const { run: act, pending, error, runtime } = useRoadmapAction();
  const draft = view.draft!;
  const writer = draftRunWriterOf(run);
  const rejected = runRejectedOf(run);
  // The v4 header names only what the run asked and the reply used (contracts §20), read from the rows on screen.
  const parts = geminiV4PartsOf(draft.milestones, { field: header.area.kind === "FIELD" });
  const { eyebrow, lead } = draftLeadOf(writer, mode, draft.nonEnglish, draftHasGeminiWords(draft.milestones), keysOnly, picksAreChoicesOf(run), parts);
  const capped = run?.capped === true || run?.status === "CAPPED";
  const geminiLive = (gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey;
  // On a keys-only draft the uncovered lines sit under "Lines to look at", with the lines tied to no Domain.
  const uncovered = !keysOnly && draft.uncoveredSyllabus.length > 0 ? <UncoveredSyllabus indices={draft.uncoveredSyllabus} milestoneId={next?.id ?? null} ord={next?.ord ?? null} /> : null;
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
  const bodyTrack = header.area.kind === "TRACK" && header.area.track === "BODY";
  // The activity card below carries HEALTH_LINE itself on a body or care plan (once per screen).
  const activityCard = activityCardOf(draft.activityConfirm);
  const cardHealth = activityCard != null && activityHealthOf(activityCard);
  return (
    <section className="card rm-aim" aria-label="The draft">
      <div className="t-eyebrow">{eyebrow}</div>
      <p className="rm-aim-t">{header.aim}</p>
      <div className="rm-chips">
        <AreaChipView area={header.area} />
        <Chip>{header.depth != null ? depthName(header.depth) : byLine(header.targetDay, view.today, false)}</Chip>
        {header.examLabel && <Chip>Exam: {header.examLabel}</Chip>}
        <Chip>
          {header.hoursPerWeek} h a week · {INTENSITY_WORD[header.intensity]}
        </Chip>
      </div>
      {rejected ? <p className="rm-lead">{RUN_REJECTED_LINE}</p> : lead && <p className="rm-lead">{lead}</p>}
      {keysOnly && bodyTrack && !cardHealth && <p className="rm-lead">{HEALTH_LINE}</p>}
      <div className="rm-lines">
        {run && runSaysMore(run) && <RunFacts run={run} today={view.today} />}
        {header.constraints && !keysOnly && <span>{CONSTRAINTS_LINE}</span>}
        {uncovered}
        <span>
          <Link className="rm-ilink" href={ROADMAP_NEW_HREF}>
            Edit the intake
          </Link>
          {geminiLive && writer === "GEMINI" && !capped && (
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

/**
 * Gemini's Domain additions (F-R4-21): one row above the milestones with the
 * user's own Domains, their real counts, the count each would be held to,
 * and the date effect, shown before anything is confirmed. A pending one
 * blocks Accept. Nothing is ever added without the user's tap.
 */
export function AdditionsCard({ view }: { view: RoadmapView }) {
  const draft = view.draft!;
  const header = view.header!;
  const adds = draft.additions ?? [];
  const [choosing, setChoosing] = useState(draft.additionsMode === "TOGGLES");
  const [on, setOn] = useState<Set<string>>(new Set());
  const { run, pending, error } = useRoadmapAction();
  if (adds.length === 0) return null;
  const open = adds.filter((a) => !a.blocked);
  const confirm = (ids: readonly string[]) => run((a) => a.confirmDomainAdditions(header.id, draft.version, [...ids]));
  const effect = (ids: readonly string[]) => {
    const names = adds.filter((a) => ids.includes(a.domainId)).map((a) => a.name);
    const { from, to } = additionsDatesOf(draft, ids);
    return additionEffectLine(names, from, to);
  };
  const allEffect = effect(open.map((a) => a.domainId));
  // R never passes DEPTH_DOMAINS_MAX: once the chosen ones fill it, the rest are disabled.
  const required = draft.depth?.coverage.length ?? 0;
  const roomLeft = Math.max(0, DEPTH_DOMAINS_MAX - required);
  return (
    <section className="card rm-adds" id={ADDITIONS_DOM_ID} aria-label="Gemini's suggested Domains">
      <p className="rm-adds-t">{additionsLine(adds)}</p>
      {!choosing && allEffect && <p className="t-meta">{allEffect}</p>}
      {choosing &&
        adds.map((a) => {
          const full = !on.has(a.domainId) && on.size >= roomLeft;
          const blocked = a.blocked ?? (full ? "TOO_MANY_DOMAINS" : null);
          const one = effect([a.domainId]);
          return (
            <div key={a.domainId} id={a.itemId ? rowDomId(a.itemId) : undefined} className={blocked ? "rm-add rm-add-blocked" : "rm-add"}>
              <div>
                <b>{a.name}</b>
                <p className="t-meta">
                  {plural(a.cards, "card")}
                  {a.atSix > 0 ? ` · ${a.atSix} at level 6+` : ""} · counts at {a.n}
                </p>
                <p className="t-meta">{blocked ? additionBlockedLine(a.name, blocked) : one}</p>
              </div>
              <Switch
                checked={on.has(a.domainId)}
                disabled={Boolean(blocked)}
                onChange={(v) => setOn((s) => (v ? new Set([...s, a.domainId]) : new Set([...s].filter((x) => x !== a.domainId))))}
                label={`Add ${a.name}`}
              />
            </div>
          );
        })}
      {choosing && on.size > 1 && <p className="t-meta">{effect([...on])}</p>}
      <div className="rm-acts">
        {choosing ? (
          <>
            <Button variant="primary" disabled={pending} onClick={() => confirm([...on])}>
              {CONFIRM_WORD}
            </Button>
            <p className="t-meta" style={{ margin: 0 }}>
              Each is off until you turn it on. Gemini can&apos;t check what the aim needs.
            </p>
          </>
        ) : (
          <>
            {open.length > 0 && (
              <Button disabled={pending} onClick={() => confirm(open.map((a) => a.domainId))}>
                {open.length === 1 ? `Add ${open[0].name}` : addAllWord(open.length)}
              </Button>
            )}
            <Button onClick={() => setChoosing(true)}>{CHOOSE_WORD}</Button>
            <Button variant="quiet" disabled={pending} onClick={() => confirm([])}>
              {LEAVE_OUT_WORD}
            </Button>
          </>
        )}
      </div>
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}

/**
 * The kinds the constraints left out (with [Allow one]) and the aim-conflict
 * line (F-R4-17). With the gate's view (contracts §19) the activity card
 * lists the user's words' suggestions with their answer (a suggestion never
 * leaves anything out), so only the aim-conflict line stays here. That line
 * quotes the user's own sentence, never a "no X" built from it, and shows
 * only while unresolved (decision 6; aimConflictLineOf): with the card, until
 * the card is answered under these words.
 */
function ExclusionsCard({ view, allowed, onAllow }: { view: RoadmapView; allowed: readonly CatalogKey[]; onAllow: (k: CatalogKey) => void }) {
  const draft = view.draft!;
  const confirm = activityConfirmOfView(view);
  const gated = confirm != null;
  const xs = gated ? [] : (draft.exclusions ?? []).filter((x) => !allowed.includes(x.kind));
  const line = exclusionsLine(xs);
  const conflict = aimConflictLineOf({ conflict: draft.aimConflict, constraints: view.header!.constraints, aim: view.header!.aim, confirm, leftOut: xs.length });
  const [allowing, setAllowing] = useState(false);
  if (!line && !conflict && allowed.length === 0) return null;
  return (
    <section className="card pad rm-excl" aria-label={gated ? "Your aim and your constraints" : "Left out because of your constraints"}>
      {line && (
        <p className="t-meta rm-ink1" style={{ margin: 0 }}>
          {line}{" "}
          <button type="button" className="rm-ilink" onClick={() => setAllowing((v) => !v)} aria-expanded={allowing}>
            Allow one
          </button>
        </p>
      )}
      {allowing && (
        <div className="rm-acts">
          {xs.map((x) => (
            <ChipButton key={x.kind} onClick={() => onAllow(x.kind)}>
              {KIND_NAME[x.kind]}
            </ChipButton>
          ))}
        </div>
      )}
      {allowed.length > 0 && <p className="t-meta">Allowed back in the type picker: {allowed.map((k) => KIND_NAME[k]).join(", ")}.</p>}
      {conflict && <p className="t-meta rm-ink1">{conflict}</p>}
    </section>
  );
}

/**
 * A body or care plan's one session-picks confirm (F-R4-17): it quotes the
 * constraints and blocks Accept until answered. The swap names what it puts
 * in place of the picks on this track (sessionSwapKindsOf): easy, mobility
 * and technique on a body plan, Plan the week ahead and Keep a log on a care
 * plan, never one the user said to avoid.
 */
function SessionPicksCard({ view }: { view: RoadmapView }) {
  const draft = view.draft!;
  const picks = draft.sessionPicks;
  const { run, pending, error } = useRoadmapAction();
  if (!picks || picks.decision !== "PENDING" || picks.kinds.length === 0) return null;
  const swap = sessionSwapOfView(view);
  return (
    <section className="card rm-adds" id={PICKS_DOM_ID} aria-label="Gemini's session picks">
      <p className="rm-adds-t">{sessionPicksLine(picks)}</p>
      <div className="rm-acts">
        <Button disabled={pending} onClick={() => run((a) => a.confirmSessionPicks(view.header!.id, "KEEP"))}>
          {SESSION_PICKS_KEEP}
        </Button>
        <Button variant="primary" className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.confirmSessionPicks(view.header!.id, "EASY"))}>
          {sessionPicksSwapWord(swap)}
        </Button>
      </div>
      <p className="t-meta">{sessionPicksSwapLine(swap)}</p>
      {error && <ActionError>{sessionPicksRefusalOf(error, swap)}</ActionError>}
    </section>
  );
}

/**
 * What the session picks' swap places on this plan (sessionSwapKindsOf over
 * the plan's catalog track and its answers): the card's button and line, and
 * the words a picks refusal is shown in (sessionPicksRefusalOf).
 */
export function sessionSwapOfView(view: Pick<RoadmapView, "header" | "draft" | "activityConfirm">): CatalogKey[] {
  const h = view.header;
  if (!h) return [];
  return sessionSwapKindsOf(catalogTrackOf({ fieldId: h.area.kind === "FIELD" ? h.area.fieldId : null, track: h.track }), activityConfirmOfView(view));
}

/**
 * "Lines to look at" (F-R4-21, F-R4-24): lines in no milestone, lines tied to
 * no Domain, or the outline's empty state. The empty state names Gemini only
 * where Gemini may be named (`gemini`: its path live with a key, or a draft
 * Gemini arranged); otherwise "What to learn comes from your outline." alone.
 */
function OutlineLines({ view, next, gemini }: { view: RoadmapView; next: MilestoneDraft | null; gemini: boolean }) {
  const draft = view.draft!;
  const header = view.header!;
  const unassigned = unassignedLinesLine(draft.unassignedLines ?? [], (draft.depth?.coverage.length ?? 0) >= DEPTH_DOMAINS_MAX);
  if (!header.hasSyllabus && header.area.kind === "FIELD") {
    return (
      <section className="card pad rm-lines-card" aria-label="What to learn">
        <p className="t-meta rm-ink1" style={{ margin: 0 }}>
          {outlineEmptyLine(gemini)}
        </p>
        {header.examLabel && <p className="t-meta rm-ink1">{OUTLINE_EMPTY_EXAM_LINE}</p>}
        <div className="rm-acts">
          <Button href={`${ROADMAP_NEW_HREF}#syllabus`}>{ADD_OUTLINE_WORD}</Button>
        </div>
      </section>
    );
  }
  if (draft.uncoveredSyllabus.length === 0 && !unassigned) return null;
  return (
    <div>
      <SectionHeader title="Lines to look at" aside="from your outline" />
      <section className="card pad rm-lines-card">
        <UncoveredSyllabus indices={draft.uncoveredSyllabus} milestoneId={next?.id ?? null} ord={next?.ord ?? null} />
        {unassigned && (
          <p className="t-meta">
            {unassigned}{" "}
            <Link className="rm-ilink" href={`${ROADMAP_NEW_HREF}#syllabus`}>
              Choose Domains
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}

function DraftFooter({
  view,
  next,
  outlineCount,
  mode,
  over,
  setOver,
}: {
  view: RoadmapView;
  next: MilestoneDraft | null;
  outlineCount: number;
  mode: "draft" | "replan";
  over: boolean;
  setOver: (v: boolean) => void;
}) {
  const draft = view.draft!;
  const header = view.header!;
  const { run, pending, error, runtime } = useRoadmapAction();
  const [hint, setHint] = useState<string | null>(null);
  const undecided = next ? undecidedOf(next) : [];
  const f = draft.feasibility;
  // Only a milestone of this draft can be fixed here: a started (carried) one listed first never names the footer (fix round 2's carry-over).
  const impossibleMs = f.milestones.find((x) => x.worst === "IMPOSSIBLE" && draft.milestones.some((m) => m.lineageId === x.lineageId));
  const target = nextTargetOf(draft, undecided[0]?.id ?? null);
  const dateImpossible = draft.dateCheck?.verdict === "IMPOSSIBLE";
  const needsOver = f.over || draft.dateCheck?.verdict === "OVER";
  const pendingPlanLevel = target === ADDITIONS_DOM_ID ? "Gemini's suggested Domains" : target === PICKS_DOM_ID ? "Gemini's session picks" : null;

  if (dateImpossible) {
    return (
      <div className="rm-sticky">
        <Button variant="primary" size="lg" onClick={() => scrollToId("date")}>
          Change the date or the depth
        </Button>
        <p className="t-meta">Your date is before the earliest this depth can be reached: use the realistic date, or choose a lower depth.</p>
      </div>
    );
  }

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

  if (!draft.acceptable && target) {
    return (
      <div className="rm-sticky">
        <Button variant="primary" size="lg" onClick={() => scrollToId(target)}>
          Next item to decide
        </Button>
        <p className="t-meta">
          {pendingPlanLevel ? `1 left: ${pendingPlanLevel}. Then Accept. ` : next ? `${plural(undecided.length, "item")} left in milestone ${next.ord}. ` : ""}
          {!pendingPlanLevel && outlineCount > 0 ? `${outlineCount === 1 ? "The other milestone stays" : "The other milestones stay"} an outline; you decide their items when you start each one.` : ""}
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
    if (needsOver && !over) {
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
      {needsOver && (
        <div className="rm-sw" style={{ flexBasis: "100%" }}>
          <span className="rm-sw-t">Keep it over my hours/pace</span>
          <Switch checked={over} onChange={setOver} label="Keep it over my hours/pace" />
        </div>
      )}
      <Button variant="primary" size="lg" onClick={accept} disabled={pending}>
        {pending ? "Accepting…" : "Accept plan"}
      </Button>
      <p className="t-meta">
        Milestone {next?.ord ?? 1} ready{outlineCount > 0 ? ` · ${outlineCount} in outline` : ""}.{needsOver ? " Kept over, it shows a quiet “Over” chip for good." : ""}
      </p>
      {hint && (
        <p className="t-error" role="alert">
          {hint}
        </p>
      )}
      {error && <ActionError>{sessionPicksRefusalOf(error, sessionSwapOfView(view))}</ActionError>}
    </div>
  );
}

export function DraftReview({
  view,
  mode = "draft",
  gates,
}: {
  view: RoadmapView;
  /** "replan": an ACTIVE roadmap's version + 1, shown above Now. */
  mode?: "draft" | "replan";
  /** Fixtures only: draw a lead-only state (the area-suggestion panel). */
  gates?: LiveGates;
}) {
  const draft = view.draft;
  const header = view.header;
  const [allowed, setAllowed] = useState<CatalogKey[]>([]);
  const [over, setOver] = useState(false);
  const index = useMemo(() => domainIndexOf(view), [view]);
  const scope = useMemo(() => (draft ? editorScopeOf(view, draft.milestones, allowed) : null), [view, draft, allowed]);
  if (!draft || !header || !scope) return null;

  const keysOnly = isKeysOnlyDraft(draft);
  const sched = scheduledOf(draft.milestones);
  const live = sched.filter((m) => !isHeldMilestone(m));
  const next = draft.milestones.find((m) => m.lineageId === draft.nextLineageId) ?? live.find((m) => m.status === "DRAFT") ?? live[0] ?? null;
  const outline = draft.milestones.filter((m) => m !== next).sort((a, b) => a.ord - b.ord);
  // A re-plan's milestones take their places after the carried ones (one place per lineage).
  const carried = mode === "replan" ? carriedRowsOf(view.milestones) : [];
  const ranks = rankPlanOf(draft.milestones, carried);
  const mfOf = (m: MilestoneDraft) => draft.feasibility.milestones.find((x) => x.lineageId === m.lineageId) ?? null;
  const required = draft.depth?.coverage.map((c) => ({ id: c.domainId, name: c.name })) ?? [];
  // The plan's track, exam and gate (the scope's: what the type picker leaves out), so a stage's options are the ones Gemini was offered.
  const stageRun = stageRunOf(scope);
  const ctx: MilestoneCardContext = {
    roadmapId: header.id,
    today: view.today,
    intensity: header.intensity,
    m: draft.feasibility.m,
    targetDay: header.targetDay,
    dateByApp: header.dateMode === "REALISTIC" || header.dateOrigin?.origin === "REALISTIC" || draft.dateCheck?.dateOrigin.origin === "REALISTIC",
    domainIndex: index,
    credentialNoSyllabus: draft.credential && !header.hasSyllabus,
    bulkKeepOff: draft.bulkKeepOff,
    throughput: view.throughput,
    hoursPerWeek: header.hoursPerWeek,
    milestoneCount: new Set(carried.map((c) => c.lineageId)).size + sched.length,
    // A re-plan's roadmap is ACTIVE: its intake is closed, so the checks' "Add a figure" opens the figure sheet.
    intakeEditable: mode === "draft",
    keysOnly,
    moves: keysOnly
      ? {
          roadmapId: header.id,
          milestones: live.filter((m) => m.id && (m.status === "DRAFT" || m.status === "PLANNED")).map((m) => ({ id: m.id as string, label: `Milestone ${m.ord} · ${m.title}` })),
          domains: required,
        }
      : null,
    body: header.area.kind === "TRACK" && header.area.track === "BODY",
    practiceOnly: practiceOnlyLineOf(activityConfirmOfView(view)),
    // The practice progression (contracts §20): each stage's why, read from what it holds — on a keys-only draft whose rows are
    // code's progression (rowsAreProgressionOf: any writer but a v3 reply, which chose every type itself).
    whys: keysOnly && rowsAreProgressionOf(view.run) ? stageWhysOf(draft.milestones, stageRun) : null,
    catalogTrack: stageRun.track,
  };
  // The banner names what happened to the latest run; who wrote the rows is the header's (RunView.wrote).
  const banner = mode === "draft" && !runRejectedOf(view.run) ? draftBannerOf(view.run) : null;
  const outlineRange = outline.length > 0 ? (outline.length === 1 ? `Milestone ${outline[0].ord}` : `Milestones ${outline[0].ord}–${outline[outline.length - 1].ord}`) : null;
  const geminiArranged = draft.milestones.some((m) => m.arrangedBy === "GEMINI");
  // The arrangement line names only what Gemini arranged that still stands (contracts §20): on a v4 run, the outline's order when
  // it moved your lines and the practices still marked as its choice (none: no line); a v3 run's line is unchanged.
  const arrangement = !geminiArranged
    ? null
    : picksAreChoicesOf(view.run)
      ? arrangementV4Line(geminiV4PartsOf(draft.milestones, { field: header.area.kind === "FIELD" }))
      : ARRANGEMENT_LINE;

  return (
    <ItemEditor scope={scope}>
      <div className="rm-stack">
        {banner && (
          <section className="card rm-note">
            <RoadmapGlyph name="info" />
            <span>{banner}</span>
          </section>
        )}
        <DraftHeader header={header} run={view.run} view={view} mode={mode} next={next} keysOnly={keysOnly} gates={gates} />
        {/* Constraint safety (contracts §19): which activities to avoid. A re-plan's sits on the living roadmap above it. */}
        {(mode === "draft" || view.activityConfirm === undefined) && <ActivityConfirmCard view={draft.activityConfirm} roadmapId={header.id} today={view.today} place="draft" />}
        {keysOnly && <AdditionsCard view={view} />}
        {keysOnly && <SessionPicksCard view={view} />}
        {keysOnly && <ExclusionsCard view={view} allowed={allowed} onAllow={(k) => setAllowed((a) => (a.includes(k) ? a : [...a, k]))} />}
        {draft.alarm && !keysOnly && (
          <section className="card rm-note">
            <Icon name="flag" />
            <span>
              <b>Most of this draft needs your check.</b>
            </span>
          </section>
        )}
        {ctx.credentialNoSyllabus && mode === "draft" && !keysOnly && (
          <section className="card rm-banner">
            <p className="rm-banner-t">
              <b>{CREDENTIAL_LINE}</b>
            </p>
            <Button href={`${ROADMAP_NEW_HREF}#syllabus`}>Paste the syllabus</Button>
          </section>
        )}
        {keysOnly && (draft.depth || draft.dateCheck) && (
          <div>
            <SectionHeader title={draft.depth ? "Depth and date" : "Date"} aside="worked out by the app" />
            <section className="card rm-date-card">
              {draft.depth && (
                <div className="rm-ms-sec" style={{ borderTop: 0 }}>
                  <DepthLines depth={draft.depth} m={draft.feasibility.m} aim={header.aim} today={view.today} />
                </div>
              )}
              {draft.dateCheck && (
                <DateBlock
                  roadmapId={header.id}
                  check={draft.dateCheck}
                  depth={draft.depth?.depth ?? header.depth ?? null}
                  rows={live.map((m) => ({ stage: m.stage ?? null, gateLevel: m.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS")?.minLevel ?? null, dueDay: m.dueDay }))}
                  mode="draft"
                  keepOver={over}
                  onKeepMyDate={() => {
                    if (draft.dateCheck?.verdict === "OVER") setOver(true);
                    scrollToId("rm-accept");
                  }}
                />
              )}
              {draft.depth && draft.depth.depth === 12 && <p className="rm-ms-sec t-meta">{paragonDepthLine(draft.depth.coverage.length)}</p>}
            </section>
          </div>
        )}
        {keysOnly && arrangement && (
          <section className="card rm-arr">
            <RoadmapGlyph name="info" />
            <span>{arrangement}</span>
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
        {keysOnly && mode === "draft" && <OutlineLines view={view} next={next} gemini={geminiNamedOf((gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey, view.run)} />}
        <GapPanel gaps={draft.gaps} hidden={draft.gapsHidden} scope={scope} gates={gates} />
        <div id="rm-accept">
          <DraftFooter view={view} next={next} outlineCount={outline.filter((m) => !isHeldMilestone(m)).length} mode={mode} over={over} setOver={setOver} />
        </div>
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
