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
 *     order and each practice marked as Gemini's choice), with [Keep my
 *     order] when Gemini moved the outline's lines (the lead's ruling 7);
 *   - Gemini's practice choices that accept waits on, in one card while one
 *     sits on an outline card ([Keep them] [Use the app's defaults]; one on
 *     the expanded card has its own two buttons on its row);
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
 *
 * Fewer words, more motion (ui-motion.md §3.3 screens 2 and 12, §6.1, §7.2,
 * §7.12; lane R5). The header card opens on the unlit horizon marks (static
 * SVG, contours to the chosen depth), then the eyebrow and the aim verbatim,
 * the settings as chips (Area · L9, the depth, the exam, "6 h/wk yours ·
 * Steady", «Google may use this» on the Gemini path), and who did what as two
 * GlyphLanes with their who-words ("Gemini: order · picks" / "App: practices
 * · words · numbers"; the lead line in their (i)); the run is the integrity
 * chip (integrityLine verbatim) or its counts. The Depth and date card is a
 * StageLadder, the Domain chips, «review gap ≈ 110 d» «App policy» «yours to
 * judge», the DateBlock (TimeBar, the realism figures, the verdict), the idle
 * Paragon seal with its four conditions, and the card Key. Every sentence
 * these replace stays in the DOM, one tap away (a chip's panel, an (i), the
 * Key, the TimeBar's list). Drafting is a WAIT card: the weave band (shader
 * in full, ≤ 90 s, its static strands otherwise), the route.weave glyph, the
 * 40 px pause in the heading row and the aria-live line verbatim; a re-plan's
 * card does the same while its run is RUNNING. No bar, no %.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { SectionHeader, Switch } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, Mark } from "@/components/glyph/Glyph";
import { GlyphLane } from "@/components/glyph/GlyphLane";
import { Fig } from "@/components/glyph/GlyphStat";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip, type KeyEntry } from "@/components/glyph/InfoTip";
import { RankSeal } from "@/components/glyph/RankSeal";
import { StageLadder } from "@/components/glyph/StageLadder";
import { GATE_LEVEL, STAGE_GATES, type StageGate } from "@/components/glyph/paths/stage";
import { DraftWeave } from "@/components/fx/DraftWeave";
import { HorizonMarks } from "@/components/fx/fallbacks";
import { ShaderSlot } from "@/components/fx/ShaderSlot";
import { WeavePause } from "@/components/fx/WeavePause";
import { speakFigure } from "@/lib/figure-speech";
import { BAND, horizonParams } from "@/lib/shader/params";
import {
  ACCEPT_UNDO_MS,
  AIM_RANKS,
  DEPTH_DOMAINS_MAX,
  DRAFT_REFRESH_MAX_MS,
  DRAFT_REFRESH_MS,
  PACK_SECTIONS,
  ROADMAP_GEMINI_LIVE,
  RUN_STALE_MS,
  isPracticeFamily,
  type DepthView,
  type DraftView,
  type MilestoneDraft,
  type RoadmapHeader,
  type RoadmapView,
  type RunView,
  type RunWriter,
} from "@/lib/roadmap-types";
import { catalogTrackOf, type CatalogKey } from "@/lib/roadmap-catalog";
import {
  APP_LANE_ITEMS,
  APP_LANE_WORD,
  ARRANGEMENT_LINE,
  BUILT_LEAD_LINE,
  COVERAGE_UNCHECKED_LINE,
  FREE_TIER_LINE,
  GEMINI_LANE_ITEM,
  GEMINI_LANE_WORD,
  SHORT_GEMINI_GUESS,
  SHORT_GEMINI_ORDER,
  SHORT_PAUSE_LABEL,
  SHORT_REVIEW_GAP,
  SHORT_YOURS,
  coverageChoiceLine,
  coverageJudgeLine,
  depthChoiceLine,
  depthGapDays,
  depthLine,
  domainOriginLine,
  privacyLine,
  CHOICES_PLAN_LEVEL,
  CHOOSE_WORD,
  CONFIRM_WORD,
  CONSTRAINTS_LINE,
  CREDENTIAL_LINE,
  GEMINI_LEAD_LINE,
  GEMINI_V3_LEAD_LINE,
  GEMINI_V4_LEAD_LINE,
  HEALTH_LINE,
  INTENSITY_WORD,
  KEEP_MY_ORDER_WORD,
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
  appDefaultsWord,
  additionBlockedLine,
  additionEffectLine,
  additionsLine,
  arrangementV4Line,
  byLine,
  choicesWaitingLine,
  depthName,
  exclusionsLine,
  geminiV4LeadLine,
  keepChoicesWord,
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
  aimDateOfHeader,
  geminiLaneItemsOf,
  horizonOfRoadmap,
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
  pendingChoicesOf,
  pickerExcludedOf,
  picksAreChoicesOf,
  practiceOnlyLineOf,
  rankPlanOf,
  referenceRunOf,
  rowDomId,
  rowsAreManualOf,
  rowsAreProgressionOf,
  scheduledOf,
  sessionSwapKindsOf,
  stageRunOf,
  stageWhysOf,
  undecidedOf,
  type EditorRow,
  type GeminiV4Parts,
} from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { ItemEditor, type ItemEditorScope } from "./ItemEditor";
import { MilestoneCard, type MilestoneCardContext } from "./MilestoneCard";
import { RunFacts } from "./RunFacts";
import { DateBlock } from "./DateBlock";
import { GapPanel, type LiveGates } from "./GapPanel";
import { RoadmapGlyph } from "./RoadmapGlyph";
import { ActivityConfirmCard, activityHealthOf } from "./ActivityConfirm";
// ── Revision 5, lane 9: a TOPICS draft's map card (only while TOPIC_PLANS_LIVE, or a fixture's lead-only gate) ──
import { TopicMap } from "./TopicMap";
import { acceptTopicChoicesOf, topicGeminiOn, topicNamesOn, topicPlansOn } from "./topic-map-model";
import { AFTERCARE_ARCHIVE_WORD, AFTERCARE_KEEP_WORD, aftercareGroupLabel, createsDomainsLine, geminiNamesAmongLine, liveMilestoneClosesLine } from "./roadmap-copy";
// ── Revision 5, fix round: the Gemini chain's wait, its poll and its stop line (ruling 47) ──
import { useTopicChainPoll } from "./roadmap-runtime";
import { CHAIN_STOPPED_LINE, CHANGE_DATE_HOURS_WORD, CHECK_AGAIN_WORD, FEWER_LAYERS_WORD, TRY_AGAIN_WORD, WRITE_TOPICS_WORD, chainLeadLine, chainRunningLine, chainStopLine } from "./roadmap-copy";
import { LAYERS_MIN, type RoadmapActionResult, type TopicChainView } from "@/lib/roadmap-types";
// ── Revision 5 (fixer B): [Break it down] on a TOPICS draft no chain is on (ruling 58) ──
import { BREAK_IT_DOWN_WORD } from "./roadmap-copy";
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
    // A plan you wrote yourself stays yours (the lead's ruling 6): each stage offers "Add the app's practice" instead.
    manual: rowsAreManualOf(rowsRunOf(view, milestones)),
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
 * their plan-level card, so the footer scrolls there. Gemini's practice
 * choices the choices card decides (`cardChoices`: those on a card shown as
 * an outline, which offers no button) go to that card too; one on the
 * expanded card goes to its row.
 */
export function nextTargetOf(draft: Pick<DraftView, "nextToDecide" | "additions" | "sessionPicks" | "milestones">, fallback: string | null, cardChoices: readonly string[] = []): string | null {
  const id = draft.nextToDecide ?? fallback;
  const additionIds = new Set((draft.additions ?? []).map((a) => a.itemId).filter((x): x is string => Boolean(x)));
  const pendingAdd = draft.milestones.some((m) => m.items.some((it) => it.kind === "DOMAIN" && it.origin === "GEMINI" && it.decision === "PENDING" && it.notes.includes("NOT_CHOSEN")));
  if (pendingAdd && (draft.additions?.length ?? 0) > 0 && (!id || additionIds.has(id) || draft.milestones.some((m) => m.items.some((it) => it.id === id && it.notes.includes("NOT_CHOSEN"))))) return ADDITIONS_DOM_ID;
  if (draft.sessionPicks?.decision === "PENDING" && (!id || draft.milestones.some((m) => m.items.some((it) => it.id === id && it.notes.includes("GEMINI_PICK"))))) return PICKS_DOM_ID;
  if (id && cardChoices.includes(id)) return PICKS_DOM_ID;
  return id ? rowDomId(id) : null;
}

/**
 * Gemini's practice choices accept waits on (roadmap-ui-model
 * pendingChoicesOf), on a plan whose picks need no session confirm (a Field
 * plan's; a body or care plan's wait in SessionPicksCard): `all` in plan
 * order, and `outside` those on a card other than the expanded one (an
 * outline card offers no button, so the choices card decides them).
 */
export function choicesWaitingOf(draft: Pick<DraftView, "milestones" | "sessionPicks">, scope: ItemEditorScope, next: Pick<MilestoneDraft, "lineageId"> | null): { all: EditorRow[]; outside: EditorRow[] } {
  if (draft.sessionPicks) return { all: [], outside: [] };
  const all = pendingChoicesOf(draft.milestones, { ...stageRunOf(scope), choices: scope.choices === true });
  const inNext = new Set((next ? (draft.milestones.find((m) => m.lineageId === next.lineageId)?.items ?? []) : []).map((it) => it.id ?? it.lineageId));
  return { all, outside: all.filter((r) => !inNext.has(r.id)) };
}

/** RunFacts adds to the lead line only for a Gemini run or a report with entries ("built from your numbers" is the lead already). */
function runSaysMore(run: RunView): boolean {
  // A topic chain step (revision 5) writes no rows and its report isn't a draft's: the chain's own lead and line say what it did.
  if (run.phase) return false;
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

/**
 * Who did what on a Gemini draft, as two GlyphLanes with their who-words (D25; ui-motion.md §3.3
 * screen 2): the lead line they replace is their (i), verbatim. Gemini's lane lists only what it
 * did on this draft (a v4 reply: geminiV4PartsOf's needs · order · picks, geminiLaneItemsOf; a v3
 * reply: its Domains, the order and the types; a rev-3 draft: the words). null: the lead line
 * stays visible as it was (the app's or your own draft, a re-plan the app re-fitted, a non-English
 * draft's language line, a rejected reply).
 */
export function draftLanesOf(o: { writer: RunWriter | null; keysOnly: boolean; choices: boolean; parts: GeminiV4Parts | null; nonEnglish: boolean; rejected: boolean }): { gemini: string[]; app: string[] } | null {
  if (o.writer !== "GEMINI" || o.rejected || o.nonEnglish) return null;
  if (o.keysOnly && o.choices) return { gemini: o.parts ? geminiLaneItemsOf(o.parts) : [GEMINI_LANE_ITEM.needs, GEMINI_LANE_ITEM.order, GEMINI_LANE_ITEM.picks], app: [...APP_LANE_ITEMS] };
  if (o.keysOnly) return { gemini: [GEMINI_LANE_ITEM.needs, GEMINI_LANE_ITEM.order, GEMINI_LANE_ITEM.picks], app: APP_LANE_ITEMS.filter((x) => x !== "practices") };
  return { gemini: ["words"], app: ["numbers"] };
}

/** The lanes and their (i), or the lead line itself. */
function LeadLanes({ lead, lanes }: { lead: string | null; lanes: { gemini: string[]; app: string[] } | null }) {
  if (!lead) return null;
  if (!lanes) return <p className="rm-lead">{lead}</p>;
  return (
    <div className="rm-dh-lanes">
      <div className="rm-dh-lane-l">
        <GlyphLane who="gemini" items={lanes.gemini} whoWord={GEMINI_LANE_WORD} />
        <GlyphLane who="app" items={lanes.app} whoWord={APP_LANE_WORD} />
      </div>
      <InfoTip topic="who did what on this draft">{lead}</InfoTip>
    </div>
  );
}

const TRACK_SIGIL_OF = { CRAFT: "craft", BODY: "body", CARE: "care", DUTY: "duty" } as const;

/** "[s-know] Statistics · L9", or a track Area's "Body · practice only" (the name is a name; the level a figure). */
function AreaChip({ area }: { area: RoadmapHeader["area"] }) {
  if (area.kind === "FIELD")
    return (
      <Chip sigil="know">
        <span data-wc="name">{area.name}</span>
        <Fig compact={` · L${area.level}`} speech={`, level ${area.level}`} />
      </Chip>
    );
  return (
    <Chip sigil={TRACK_SIGIL_OF[area.track]}>
      <span data-wc="name">{TRACK_WORD[area.track]}</span> · practice only
    </Chip>
  );
}

/**
 * A date chip's words by whose date it is (C2-M2): the app's estimate "L12 by ≈ Dec 2027", your own "31 Dec 2027 ·
 * yours"; a date whose setter the view doesn't say keeps its exact day and claims neither ("by 31 Dec 2027").
 */
function dateChipText(header: RoadmapHeader, today: string): string {
  const date = aimDateOfHeader(header);
  return date.whose ? date.text : byLine(header.targetDay, today, false);
}

/** A date chip's spoken twin (D26): "level 12 by about December 2027" (an estimate's ≈ is said "about"). */
function speakDate(text: string): string {
  return speakFigure(text).replace(/≈\s?/g, "about ");
}

/** The depth's cairn: the gate whose level the depth is (stage.mastered at 12). */
function depthGateOf(depth: number): StageGate | null {
  return STAGE_GATES.find((g) => GATE_LEVEL[g] === depth) ?? null;
}

/**
 * The header's settings as chips (§3.3 screen 2): the Area, the depth (its name with its level) or
 * the date (whose: "L12 by ≈ Dec 2027" the app's estimate, "31 Dec 2027 · yours"), the exam, and
 * "6 h/wk yours · Steady"; `extra` adds «Google may use this» on the Gemini path.
 */
function SettingsChips({ header, today, extra }: { header: RoadmapHeader; today: string; extra?: ReactNode }) {
  const date = aimDateOfHeader(header);
  const gate = header.depth != null ? depthGateOf(header.depth) : null;
  return (
    <Chips className="rm-dh-chips">
      <AreaChip area={header.area} />
      {header.depth != null ? (
        <Chip>
          {gate && <Glyph name={`stage.${gate}`} size={12} inherit />}
          <span data-wc="name">{depthName(header.depth)}</span>
        </Chip>
      ) : (
        <Chip>
          <Mark glyph={date.glyph} size={12} />
          <Fig compact={dateChipText(header, today)} speech={speakDate(dateChipText(header, today))} />
        </Chip>
      )}
      {header.examLabel && (
        <Chip>
          <Glyph name="quest.checkpoint" size={12} inherit />
          <span data-wc="name">{header.examLabel}</span>
        </Chip>
      )}
      <Chip>
        <Glyph name="pv.you" size={12} inherit />
        <Fig compact={`${header.hoursPerWeek} h/wk`} />
        {` ${SHORT_YOURS} · ${INTENSITY_WORD[header.intensity]}`}
      </Chip>
      {extra}
    </Chips>
  );
}

/** The header's unlit horizon (§6.1: the draft review header): static SVG marks, contours to the chosen depth, no dawn, no context. */
function UnlitHorizon({ depth, roadmapId }: { depth: number | null; roadmapId: string }) {
  const p = horizonParams({ proficiency: null, status: "DRAFT", depth, roadmapId });
  const [w, h] = BAND.page;
  return (
    <div className="rm-band">
      <ShaderSlot program="horizon" kind="static" params={[p.seed]} measured={false} fallback={null} marks={<HorizonMarks w={w} h={h} front={-1} contours={p.contours} />} className="shd-band-page" />
    </div>
  );
}

/**
 * The WAIT state's line (§7.12; D19): the run's words verbatim in aria-live, beside the
 * route.weave glyph (its CSS breathe runs only inside a [data-wait] card while no weave shader is
 * live and the card isn't paused). No bar, no %.
 */
function DraftingLine({ run }: { run: RunView }) {
  return (
    <div className="rm-drf-run" aria-live="polite">
      <Glyph name="route.weave" state="active" size={32} />
      <b className="rm-drf-t">
        Drafting · {plural(Math.max(1, run.drafts), "draft")} · started {timeSecondsLabel(run.startedAt)}
        {run.usualSeconds != null ? ` · usually about ${Math.round(run.usualSeconds)} s` : ""}
      </b>
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
  const choices = picksAreChoicesOf(run);
  const runLead = draftLeadOf(writer, mode, draft.nonEnglish, draftHasGeminiWords(draft.milestones), keysOnly, choices, parts);
  // A breakdown (revision 5, fix round): Gemini estimated the layers and/or mapped the topics, so the header says so and
  // never "Built from your numbers." beside them (the topic steps write no rows, so the rows' writer is the base map's).
  const chainLead = topicChainLeadOf(view);
  const eyebrow = chainLead && mode === "draft" ? "Draft · not accepted yet" : runLead.eyebrow;
  const lead = chainLead ?? runLead.lead;
  const lanes = chainLead ? null : draftLanesOf({ writer, keysOnly, choices, parts, nonEnglish: draft.nonEnglish, rejected });
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
  // Honest eyebrows ("… · not accepted yet") are honesty marks (§8); the others are app words.
  const eyebrowWc = /not accepted yet/.test(eyebrow) ? "honest" : undefined;
  if (mode === "replan") {
    const ords = draft.milestones.map((m) => m.ord);
    const first = ords.length > 0 ? Math.min(...ords) : null;
    const last = ords.length > 0 ? Math.max(...ords) : null;
    // A re-plan's run in progress: this card is the page's one WAIT loop (the living header's horizon stays SVG).
    // A re-plan's breakdown waits here too, between its steps (its poll is TopicChainCard's).
    const chain = view.topicChain && !view.topicChain.done ? view.topicChain : null;
    const drafting = (run != null && run.status === "RUNNING") || chain != null;
    const waiting = drafting && (chain != null || !(run?.stale ?? false));
    return (
      <section className="card rm-aim rm-dh-rp" aria-label="The re-plan draft" data-wait={waiting ? "" : undefined}>
        {drafting && (
          <div className="rm-band">
            <DraftWeave stale={!waiting} startedAt={chain?.headStartedAt ?? run?.startedAt ?? null} />
          </div>
        )}
        <div className="rm-drf-h">
          <div className="t-eyebrow" data-wc={eyebrowWc}>
            {eyebrow}
          </div>
          {waiting && <WeavePause label={SHORT_PAUSE_LABEL} />}
        </div>
        <p className="rm-lead" style={{ marginTop: 6 }}>
          Version {draft.version}
          {first != null && last != null ? ` · ${first === last ? `Milestone ${first}` : `Milestones ${first} to ${last}`}` : ""}. Started milestones stay as they are.
        </p>
        {drafting && (chain ? <TopicChainLine chain={chain} /> : run && <DraftingLine run={run} />)}
        <LeadLanes lead={lead} lanes={lanes} />
        <div className="rm-lines">
          {run && runSaysMore(run) && <RunFacts run={run} today={view.today} variant="chip" />}
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
  // Google's free tier: what drafting sent may be used (only where a Gemini run wrote this draft).
  const dataChip = (writer === "GEMINI" || chainLead != null) && view.keyTier === "FREE" ? <HonestyChip kind="data" full={`${FREE_TIER_LINE} ${privacyLine(PACK_SECTIONS)}`} /> : null;
  const hz = horizonOfRoadmap(view);
  return (
    <section className="card rm-aim rm-dh" aria-label="The draft" data-wc-block="draft-header" data-wc-fold="">
      {hz && <UnlitHorizon depth={hz.depth} roadmapId={header.id} />}
      <div className="t-eyebrow" data-wc={eyebrowWc}>
        {eyebrow}
      </div>
      <p className="rm-aim-t" data-wc="own">
        {header.aim}
      </p>
      <SettingsChips header={header} today={view.today} extra={dataChip} />
      {rejected ? <p className="rm-lead">{RUN_REJECTED_LINE}</p> : <LeadLanes lead={lead} lanes={lanes} />}
      {keysOnly && bodyTrack && !cardHealth && (
        <Chips className="rm-dh-chips">
          {/* a safety surface (D11): its panel opens instantly */}
          <span className="rm-wq-safe" data-safety="">
            <HonestyChip kind="health" full={HEALTH_LINE} />
          </span>
        </Chips>
      )}
      <div className="rm-lines">
        {run && runSaysMore(run) && <RunFacts run={run} today={view.today} variant="chip" />}
        {header.constraints && !keysOnly && (
          <span className="rm-dh-line">
            <HonestyChip kind="constraints" full={CONSTRAINTS_LINE} />
          </span>
        )}
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
 * Gemini's practice choices accept waits on, on a plan whose picks need no
 * session confirm (a Field plan's; R4's DECIDE_PRACTICE_PICKS): one line and
 * two answers for every waiting choice at once (R4's confirmSessionPicks:
 * KEEP checks them; DEFAULT takes out each pick that isn't its stage's
 * default, so code's default stands there). Shown while one
 * sits on an outline card, which offers no button; one on the expanded card
 * has its own on its row too.
 */
function ChoicesCard({ view, count }: { view: RoadmapView; count: number }) {
  const { run, pending, error } = useRoadmapAction();
  if (count === 0) return null;
  const id = view.header!.id;
  return (
    <section className="card rm-adds" id={PICKS_DOM_ID} aria-label={CHOICES_PLAN_LEVEL}>
      <p className="rm-adds-t">{choicesWaitingLine(count)}</p>
      <div className="rm-acts">
        <Button disabled={pending} onClick={() => run((a) => a.confirmSessionPicks(id, "KEEP"))}>
          {keepChoicesWord(count)}
        </Button>
        <Button variant="primary" className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.confirmSessionPicks(id, "DEFAULT"))}>
          {appDefaultsWord(count)}
        </Button>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}

/**
 * "Keep my order" under the arrangement line (the lead's ruling 7): Gemini's
 * reorder of the outline, labelled as its suggestion, is put back to the
 * user's own order in one tap (R4's keepMyOrder; lines the user moved stay
 * where they put them).
 */
function KeepMyOrder({ roadmapId }: { roadmapId: string }) {
  const { run, pending, error } = useRoadmapAction();
  return (
    <>
      <div className="rm-acts">
        <ChipButton disabled={pending} onClick={() => run((a) => a.keepMyOrder(roadmapId))}>
          {KEEP_MY_ORDER_WORD}
        </ChipButton>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </>
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
function OutlineLines({ view, next, gemini, namesLive = false }: { view: RoadmapView; next: MilestoneDraft | null; gemini: boolean; namesLive?: boolean }) {
  const draft = view.draft!;
  const header = view.header!;
  const unassigned = unassignedLinesLine(draft.unassignedLines ?? [], (draft.depth?.coverage.length ?? 0) >= DEPTH_DOMAINS_MAX);
  if (!header.hasSyllabus && header.area.kind === "FIELD") {
    return (
      <section className="card pad rm-lines-card" aria-label="What to learn">
        <p className="t-meta rm-ink1" style={{ margin: 0 }}>
          {outlineEmptyLine(gemini, view.draft?.topicMap ? "TOPICS" : (header.planKind ?? "LEVELS"), namesLive)}
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

/**
 * The Depth part of the draft's Depth and date card (ui-motion.md §3.3 screen 2): the StageLadder
 * to the chosen depth (aria-hidden; the depth's name is in the header's chip), each required
 * Domain with its count, «review gap ≈ 110 d», and the two chips that open the depth line
 * («App policy») and the coverage line («yours to judge») verbatim. The lines that record a
 * choice or a Gemini suggestion the user added stay visible, as they were.
 */
function DraftDepth({ depth, m, aim, today }: { depth: DepthView; m: number; aim: string; today: string }) {
  const gap = depthGapDays(depth.depth, m);
  const nameOf = (id: string) => depth.coverage.find((c) => c.domainId === id)?.name ?? null;
  const origins = Object.entries(depth.domainOrigins)
    .map(([id, o]) => {
      const n = nameOf(id);
      return n ? domainOriginLine(n, o, today) : null;
    })
    .filter((l): l is string => Boolean(l));
  const choices = depth.coverageChoices.map((c) => {
    const n = nameOf(c.domainId);
    return n ? coverageChoiceLine(n, c, today) : null;
  });
  return (
    <div className="rm-ms-sec rm-dd-depth" style={{ borderTop: 0 }}>
      <StageLadder chosen={depth.depth} exam={depth.exam?.reachLevel ?? null} gapDays={gap} className="rm-dd-sl" />
      <Chips className="rm-dd-row">
        {depth.coverage.map((c) => (
          <Chip key={c.domainId} sigil="know">
            <span data-wc="name">{c.name}</span>
            <Fig compact={` ${c.n}`} speech={`, ${c.n} ${c.n === 1 ? "card" : "cards"} held`} />
          </Chip>
        ))}
        <HonestyChip kind="review-gap" label={`${SHORT_REVIEW_GAP} ≈ ${gap} d`} sr={reviewGapWords(gap)} />
        <HonestyChip kind="policy" full={depthLine(depth.depth, depth.coverage, m)} />
        <HonestyChip kind="judge" full={coverageJudgeLine(aim)} />
      </Chips>
      {[...origins, ...choices.filter((l): l is string => Boolean(l)), ...(depth.outlineChecked ? [] : [COVERAGE_UNCHECKED_LINE]), ...(depth.depthChoice ? [depthChoiceLine(depth.depthChoice, today)] : [])].map((l) => (
        <p key={l} className="rm-date-l rm-dd-note">
          {l}
        </p>
      ))}
    </div>
  );
}

/** «review gap ≈ 110 d»'s words (sr, and in the card Key): the gap between reviews, never the time to the aim (C2-M8). */
export function reviewGapWords(gap: number): string {
  return `review gap about ${gap} days: the gap between a card's reviews at this depth, not the time to the aim`;
}

/** The four things Paragon needs on this plan (paragonDepthLine), as idle pips: they never light on a draft. */
const PARAGON_CONDITIONS = ["L12", "final stage", "practice kept", "standard logged"] as const;

/** The idle Paragon seal and its four conditions (§3.3 screen 2): a rank not yet held keeps its verb ("needs"); its line is in the card Key. */
function ParagonRow() {
  return (
    <div className="rm-dd-para">
      <RankSeal index={6} size={34} state="idle" />
      <span className="rm-dd-para-t">
        <span data-wc="name">{AIM_RANKS[6]}</span> needs
      </span>
      <ul className="rm-dd-pips" aria-label={`${AIM_RANKS[6]} needs`}>
        {PARAGON_CONDITIONS.map((c) => (
          <li key={c}>
            <i className="rm-dd-pip" aria-hidden="true" />
            {c === "L12" ? <Fig compact={c} /> : c}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The Depth and date card's Key (D13): each glyph on the card with its words. */
function dateCardKeyOf(depth: boolean, exam: boolean, gap: number | null): KeyEntry[] {
  return [
    ...(depth
      ? [
          { glyph: "stage.mastered", words: "Your levels, lit up to the depth you chose (a flag at the level your exam reaches)." },
          ...(gap != null ? [{ glyph: "t.span", words: `${reviewGapWords(gap)}.` } satisfies KeyEntry] : []),
          { glyph: "m.policy", words: "App policy: the depth line's counts and share are the app's policy, not facts about these subjects." },
          { glyph: "m.judge", words: "Yours to judge: whether your cards cover what the aim needs." },
        ]
      : []),
    { glyph: "quest.add", words: "New cards a week: your usual pace, as the date uses it." },
    { glyph: "ev.tested", words: "Pass rate: tested by your reviews." },
    { glyph: "m.queue", words: "Cleared: the share of your due queue you clear." },
    { glyph: "t.earliest", words: "Earliest: if every review passes." },
    ...(exam ? [{ glyph: "quest.checkpoint", words: "Your exam: what the plan reaches by then." } satisfies KeyEntry] : []),
    { glyph: "t.pin", words: "Your own date, when you set one." },
    { glyph: "pv.app", words: "The dates and figures here: worked out by the app." },
    ...(depth ? [{ glyph: "rank.6", state: "idle", words: `${AIM_RANKS[6]}: not held; its conditions never light on a draft.` } satisfies KeyEntry] : []),
  ] as KeyEntry[];
}

function DraftFooter({
  view,
  next,
  outlineCount,
  mode,
  over,
  setOver,
  choices,
  topics = false,
}: {
  view: RoadmapView;
  next: MilestoneDraft | null;
  outlineCount: number;
  mode: "draft" | "replan";
  over: boolean;
  setOver: (v: boolean) => void;
  /** Gemini's practice choices accept waits on (choicesWaitingOf). */
  choices: { all: readonly EditorRow[]; outside: readonly EditorRow[] };
  /** Revision 5, lane 9: TOPIC_PLANS_LIVE (or a fixture's gate): a TOPICS draft's accept names what it creates. */
  topics?: boolean;
}) {
  const draft = view.draft!;
  const header = view.header!;
  const { run, pending, error, runtime } = useRoadmapAction();
  const [hint, setHint] = useState<string | null>(null);
  // Revision 5, lane 9: a TOPICS draft (ruling 49, §22.14): its refusal, what accept creates, and a live milestone's practices.
  const topicMap = topics ? (draft.topicMap ?? null) : null;
  const liveOrd = topicMap && mode === "replan" ? liveMilestoneOrdOf(view) : null;
  const [aftercare, setAftercare] = useState<"KEEP" | "ARCHIVE" | null>(null);
  const undecided = next ? undecidedOf(next) : [];
  const f = draft.feasibility;
  // Only a milestone of this draft can be fixed here: a started (carried) one listed first never names the footer (fix round 2's carry-over).
  const impossibleMs = f.milestones.find((x) => x.worst === "IMPOSSIBLE" && draft.milestones.some((m) => m.lineageId === x.lineageId));
  const target = nextTargetOf(
    draft,
    undecided[0]?.id ?? choices.all[0]?.id ?? null,
    choices.outside.map((r) => r.id)
  );
  const dateImpossible = draft.dateCheck?.verdict === "IMPOSSIBLE";
  const needsOver = f.over || draft.dateCheck?.verdict === "OVER";
  const pendingPlanLevel = target === ADDITIONS_DOM_ID ? "Gemini's suggested Domains" : target === PICKS_DOM_ID ? (draft.sessionPicks ? "Gemini's session picks" : CHOICES_PLAN_LEVEL) : null;
  // The next milestone's rows still to decide: draftNeedsOf's, and Gemini's choices on its card (each with its own two buttons).
  const left = undecided.length + choices.all.length - choices.outside.length;

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
          {pendingPlanLevel ? `1 left: ${pendingPlanLevel}. Then Accept. ` : next ? `${plural(left, "item")} left in milestone ${next.ord}. ` : ""}
          {!pendingPlanLevel && outlineCount > 0 ? `${outlineCount === 1 ? "The other milestone stays" : "The other milestones stay"} an outline; you decide their items when you start each one.` : ""}
        </p>
      </div>
    );
  }

  // A TOPICS draft is accepted on its map (its refusal shows below): it never asks to add to a milestone.
  if (!topicMap && !draft.acceptable && next && next.measures.every((x) => x.role !== "PAYS")) {
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
    if (liveOrd != null && aftercare == null) {
      setHint(liveMilestoneClosesLine(liveOrd));
      return;
    }
    setHint(null);
    run(
      (a) => a.acceptPlan(header.id, topicMap ? { overAccepted: over, topicMap: acceptTopicChoicesOf(topicMap, { keepAll: false, aftercare: liveOrd != null ? aftercare : null }) } : { overAccepted: over }),
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
      {topicMap && (
        <div className="rm-tm-acc" style={{ flexBasis: "100%" }}>
          {topicMap.acceptRefusal && (
            <p className="t-error" role="alert">
              {topicMap.acceptRefusal}
            </p>
          )}
          <TopicCreatesLine map={topicMap} areaName={header.area.kind === "FIELD" ? header.area.name : TRACK_WORD[header.area.track]} />
          {liveOrd != null && (
            <div role="radiogroup" aria-label={aftercareGroupLabel(liveOrd)} className="rm-tm-pick">
              <p className="t-meta" style={{ margin: 0, flexBasis: "100%" }}>
                {liveMilestoneClosesLine(liveOrd)}
              </p>
              <button type="button" className="chip btn-chip" role="radio" aria-checked={aftercare === "KEEP"} onClick={() => setAftercare("KEEP")}>
                {AFTERCARE_KEEP_WORD}
              </button>
              <button type="button" className="chip btn-chip" role="radio" aria-checked={aftercare === "ARCHIVE"} onClick={() => setAftercare("ARCHIVE")}>
                {AFTERCARE_ARCHIVE_WORD}
              </button>
            </div>
          )}
        </div>
      )}
      <Button variant="primary" size="lg" onClick={accept} disabled={pending || (topicMap != null && topicMap.acceptRefusal != null)}>
        {pending ? "Accepting…" : "Accept plan"}
      </Button>
      {/* A TOPICS draft with no milestone yet (an empty map) has none ready: its refusal above says what to do. */}
      {(next != null || !topicMap) && (
        <p className="t-meta">
          Milestone {next?.ord ?? 1} ready{outlineCount > 0 ? ` · ${outlineCount} in outline` : ""}.{needsOver ? " Kept over, it shows a quiet “Over” chip for good." : ""}
        </p>
      )}
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
  // A topic chain step's own stop is TopicChainCard's line (revision 5, fix round); only a head the daily cap stopped keeps the cap banner.
  const chainStepRun = view.run?.phase != null && !(view.run.status === "CAPPED" && view.run.error === "daily cap");
  const banner = mode === "draft" && !runRejectedOf(view.run) && !chainStepRun ? draftBannerOf(view.run) : null;
  const outlineRange = outline.length > 0 ? (outline.length === 1 ? `Milestone ${outline[0].ord}` : `Milestones ${outline[0].ord}–${outline[outline.length - 1].ord}`) : null;
  const geminiArranged = draft.milestones.some((m) => m.arrangedBy === "GEMINI");
  // The arrangement line names only what Gemini arranged that still stands (contracts §20): on a v4 run, the outline's order when
  // it moved your lines and the practices still marked as its choice (none: no line); a v3 run's line is unchanged. A reorder
  // Gemini made gets one tap back to your own order (KeepMyOrder; the lead's ruling 7).
  const v4Parts = geminiArranged && picksAreChoicesOf(view.run) ? geminiV4PartsOf(draft.milestones, { field: header.area.kind === "FIELD" }) : null;
  const arrangement = !geminiArranged ? null : v4Parts ? arrangementV4Line(v4Parts) : ARRANGEMENT_LINE;
  // Gemini's practice choices accept waits on: the plan-level card decides those on outline cards (contracts §20; ruling 7).
  const choices = choicesWaitingOf(draft, scope, next);

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
        {keysOnly && choices.outside.length > 0 && <ChoicesCard view={view} count={choices.all.length} />}
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
            <Chips className="rm-banner-t">
              <HonestyChip kind="credential" label={SHORT_GEMINI_GUESS} full={CREDENTIAL_LINE} />
            </Chips>
            <Button href={`${ROADMAP_NEW_HREF}#syllabus`}>Paste the syllabus</Button>
          </section>
        )}
        {keysOnly && (draft.depth || draft.dateCheck) && (
          <div data-wc-block="draft-date">
            <SectionHeader title={draft.depth ? "Depth and date" : "Date"} />
            <section className="card rm-date-card" aria-label={draft.depth ? "Depth and date" : "Date"}>
              {draft.depth && <DraftDepth depth={draft.depth} m={draft.feasibility.m} aim={header.aim} today={view.today} />}
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
                  userDay={header.targetDay}
                  today={view.today}
                  throughput={view.throughput}
                  feasibility={draft.feasibility}
                  exam={draft.depth?.exam ?? null}
                />
              )}
              <div className="rm-ms-sec rm-dd-foot">
                {draft.depth && draft.depth.depth === 12 && <ParagonRow />}
                <CardKey entries={dateCardKeyOf(Boolean(draft.depth), Boolean(draft.depth?.exam), draft.depth ? depthGapDays(draft.depth.depth, draft.feasibility.m) : null)} topic="the marks on the depth and date">
                  {draft.depth && draft.depth.depth === 12 && <span className="rm-dd-tl">{paragonDepthLine(draft.depth.coverage.length)}</span>}
                </CardKey>
              </div>
            </section>
          </div>
        )}
        {/* Revision 5, fix round: the Gemini chain's poll (a re-plan's breakdown) and a stopped breakdown's line, above its map (ruling 47). */}
        {view.topicChain && <TopicChainCard view={view} mode={mode} />}
        {/* Fixer B (ruling 58): [Break it down] on a TOPICS draft no chain is on (after [Write the topics], or a [Break into topics] re-plan). */}
        {draft.topicMap && <BreakDownOffer view={view} gates={gates} />}
        {/* Revision 5, lane 9: a TOPICS draft's map (DraftView.topicMap); its milestones below read "Layer k of n" (ruling 22). */}
        {draft.topicMap && topicPlansOn(gates) && (
          <TopicMap
            map={draft.topicMap}
            mode="draft"
            gates={gates}
            seenBasis={`draft/${draft.version}`}
            today={view.today}
            canTrack={view.goals?.canAdd === true}
            liveMilestone={mode === "replan" ? liveMilestoneOrdOf(view) : null}
          />
        )}
        {keysOnly && arrangement && (
          <section className="card rm-arr">
            <Chips className="rm-arr-b">
              <HonestyChip kind="arrangement" label={SHORT_GEMINI_ORDER} full={arrangement} />
              {v4Parts?.order === "MOVED" && <KeepMyOrder roadmapId={header.id} />}
            </Chips>
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
        {keysOnly && mode === "draft" && <OutlineLines view={view} next={next} gemini={geminiNamedOf((gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey, view.run)} namesLive={topicNamesOn(gates)} />}
        <GapPanel gaps={draft.gaps} hidden={draft.gapsHidden} scope={scope} gates={gates} />
        <div id="rm-accept">
          <DraftFooter view={view} next={next} outlineCount={outline.filter((m) => !isHeldMilestone(m)).length} mode={mode} over={over} setOver={setOver} choices={choices} topics={topicPlansOn(gates)} />
        </div>
      </div>
    </ItemEditor>
  );
}

/**
 * RUNNING (F8; ui-motion.md §3.3 screen 12, §6.1, §7.12): one WAIT card. The weave band at its top
 * (the shader in full while the run is live and not paused, for at most 90 s; its static strands
 * otherwise), the 40 px pause in the heading row (never on the band), the aim, and the run's line
 * verbatim in aria-live beside the route.weave glyph. No bar, no % and nothing that spins; the page
 * refreshes from the database for at most 75 s. A stale run stops the weave at once and says so.
 * A breakdown (the Gemini chain's steps, revision 5) has its own wait: TopicRunning, whose poll drives it.
 */
export function DraftRunning({ view }: { view: RoadmapView }) {
  if (view.topicChain || view.run?.phase) return <TopicRunning view={view} />;
  return <LevelsRunning view={view} />;
}

/** A LEVELS draft's wait (the run's line, RUN_STALE_MS, [Build from my numbers] and [Try again]). */
function LevelsRunning({ view }: { view: RoadmapView }) {
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
    <div className="rm-stack" data-wc-block="roadmap-drafting">
      <section className="card rm-aim rm-drf" aria-label="Drafting" data-wait={stale ? undefined : ""}>
        <div className="rm-band">
          <DraftWeave stale={stale} startedAt={run.startedAt} />
        </div>
        <div className="rm-drf-h">
          <div className="t-eyebrow">Draft</div>
          {!stale && <WeavePause label={SHORT_PAUSE_LABEL} />}
        </div>
        {header && (
          <>
            <p className="rm-aim-t" data-wc="own">
              {header.aim}
            </p>
            <DraftingChips header={header} today={view.today} />
          </>
        )}
        {stale ? (
          <div className="rm-drf-run rm-drf-stale">
            <Icon name="clock" />
            <div className="rm-run-body">
              <b className="rm-drf-t">Drafting stopped (timed out)</b>
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
          </div>
        ) : (
          <DraftingLine run={run} />
        )}
      </section>
    </div>
  );
}

// ── Revision 5, fix round: the Gemini chain's wait, its poll and its stop line (ruling 47; ui-motion §15.9) ──

/** The chain's running line in aria-live beside route.weave: "Gemini · map · started 12 s ago". No bar, no %. */
function TopicChainLine({ chain }: { chain: TopicChainView }) {
  return (
    <div className="rm-drf-run" aria-live="polite">
      <Glyph name="route.weave" state="active" size={32} />
      <b className="rm-drf-t">{chainRunningLine(chain.phase, timeSecondsLabel(chain.startedAt))}</b>
    </div>
  );
}

/**
 * A breakdown's WAIT card (a fresh DRAFT): the same weave card, its line naming the step, and the chain's poll, which
 * claims each next step until the chain is done (the page stays here between steps). A step past TOPIC_RUN_STALE_MS,
 * or a poll that can't go on, reads "Breakdown stopped (timed out)" with [Try again] (the chain head again while the
 * estimate itself stopped, else the next step with retry) and [Write the topics] (your own map; it settles the step).
 */
function TopicRunning({ view }: { view: RoadmapView }) {
  const { run: act, pending, error } = useRoadmapAction();
  const header = view.header;
  const run = view.run!;
  const chain: TopicChainView = view.topicChain ?? {
    phase: run.phase ?? null,
    running: run.status === "RUNNING" && !run.stale,
    stale: run.stale,
    startedAt: run.startedAt,
    headStartedAt: run.startedAt,
    done: true,
    key: run.id,
    stop: null,
    retry: null,
    unchecked: 0,
    fit: null,
    line: null,
    gemini: { rated: false, mapped: false },
  };
  const poll = useTopicChainPoll(header?.id ?? null, view.topicChain ?? null);
  // A step past its stale mark is the poll's to settle (its advance marks it "timed out"); only one no poll will act on reads stopped.
  const stale = poll.stalled || poll.error != null || ((run.stale || chain.stale) && (view.topicChain?.done ?? true));
  const retry = () => {
    if (!header) return;
    poll.restart();
    act((a): Promise<RoadmapActionResult<unknown>> => (chain.phase === "RATE" || chain.retry === "BREAK_DOWN" ? a.breakDown(header.id) : a.advanceTopicChain(header.id, true)));
  };
  const shown = error ?? poll.error;
  return (
    <div className="rm-stack" data-wc-block="roadmap-drafting">
      <section className="card rm-aim rm-drf" aria-label="Drafting" data-wait={stale ? undefined : ""}>
        <div className="rm-band">
          <DraftWeave stale={stale} startedAt={chain.headStartedAt} />
        </div>
        <div className="rm-drf-h">
          <div className="t-eyebrow">Draft</div>
          {!stale && <WeavePause label={SHORT_PAUSE_LABEL} />}
        </div>
        {header && (
          <>
            <p className="rm-aim-t" data-wc="own">
              {header.aim}
            </p>
            <DraftingChips header={header} today={view.today} />
          </>
        )}
        {stale ? (
          <div className="rm-drf-run rm-drf-stale">
            <Icon name="clock" />
            <div className="rm-run-body">
              <b className="rm-drf-t">{CHAIN_STOPPED_LINE}</b>
              <p className="t-meta" style={{ marginTop: 4 }}>
                {chainRunningLine(chain.phase, timeSecondsLabel(chain.startedAt))}
              </p>
              {header && (
                <div className="rm-acts" style={{ marginTop: 12 }}>
                  <Button variant="primary" disabled={pending} onClick={retry}>
                    {TRY_AGAIN_WORD}
                  </Button>
                  <Button disabled={pending} onClick={() => act((a) => a.writeTopics(header.id))}>
                    {WRITE_TOPICS_WORD}
                  </Button>
                </div>
              )}
              {shown && <ActionError>{shown}</ActionError>}
            </div>
          </div>
        ) : (
          <TopicChainLine chain={chain} />
        )}
      </section>
    </div>
  );
}

/**
 * A TOPICS draft's chain card (above its map): the poll that drives a breakdown still under way (a re-plan's keeps its
 * page; its header carries the wait line), and a stopped breakdown's line with what to do, word-light:
 *   - the pre-check (OVER, IMPOSSIBLE): its basis line, then [Fewer layers] (when offered), [Change date or hours],
 *     [Check again] (the chain resumes: advanceTopicChain with retry) and, on a fresh draft, [Write the topics];
 *   - a failed web check ("3 not checked · web check failed"), a cap (the server's own line), MAP's replies failing or
 *     a stopped estimate: [Try again] where a retry can claim something, and [Write the topics] on a fresh draft;
 *   - "Gemini named nothing narrower." after a Go deeper, alone.
 * Nothing when the chain ran to its end.
 */
export function TopicChainCard({ view, mode }: { view: RoadmapView; mode: "draft" | "replan" }) {
  const { run: act, pending, error } = useRoadmapAction();
  const header = view.header;
  const chain = view.topicChain ?? null;
  const poll = useTopicChainPoll(header?.id ?? null, chain);
  if (!header || !chain) return null;
  const stopped = poll.stalled || poll.error != null;
  if (!chain.stop && !stopped && !error) return null;
  const id = header.id;
  const fresh = mode === "draft" && header.status === "DRAFT";
  const over = chain.stop === "OVER" || chain.stop === "IMPOSSIBLE";
  const layers = view.draft?.topicMap?.rating.layers ?? null;
  const fewer = over && chain.fit?.offers.includes("FEWER_LAYERS") === true && layers != null && layers > LAYERS_MIN ? layers - 1 : null;
  const resume = () => {
    poll.restart();
    act((a): Promise<RoadmapActionResult<unknown>> => (chain.retry === "BREAK_DOWN" ? a.breakDown(id) : a.advanceTopicChain(id, true)));
  };
  const canRetry = chain.retry != null || (stopped && !chain.stop);
  const shown = error ?? poll.error;
  return (
    <section className="card rm-note" aria-label="Breakdown" data-wc-block="topic-chain-stop">
      <RoadmapGlyph name="info" />
      <div className="rm-run-body">
        <b>{chain.stop ? chainStopLine(chain.stop, chain.unchecked) : CHAIN_STOPPED_LINE}</b>
        {chain.line && chain.stop !== "NOTHING_DEEPER" && (
          <p className="t-meta" style={{ marginTop: 4 }}>
            {chain.line}
          </p>
        )}
        {chain.stop !== "NOTHING_DEEPER" && (
          <div className="rm-acts" style={{ marginTop: 8 }}>
            {fewer != null && (
              <Button
                disabled={pending}
                onClick={() => {
                  poll.restart();
                  act(async (a): Promise<RoadmapActionResult<unknown>> => {
                    const set = await a.setLayers(id, { kind: "FEWER", layers: fewer });
                    return set.ok ? a.advanceTopicChain(id, true) : set;
                  });
                }}
              >
                {FEWER_LAYERS_WORD}
              </Button>
            )}
            {over && fresh && <Button href={ROADMAP_NEW_HREF}>{CHANGE_DATE_HOURS_WORD}</Button>}
            {canRetry && (
              <Button variant={over ? undefined : "primary"} disabled={pending} onClick={resume}>
                {over ? CHECK_AGAIN_WORD : TRY_AGAIN_WORD}
              </Button>
            )}
            {fresh && (over || chain.stop === "TIMED_OUT" || chain.stop === "REQUESTS_CAPPED" || stopped) && (
              <Button disabled={pending} onClick={() => act((a) => a.writeTopics(id))}>
                {WRITE_TOPICS_WORD}
              </Button>
            )}
          </div>
        )}
        {shown && <ActionError>{shown}</ActionError>}
      </div>
    </section>
  );
}

/**
 * [Break it down] on a TOPICS draft no Gemini chain is on (ruling 58): your [Write the topics] map on a fresh draft, or
 * the [Break into topics] re-plan of an accepted plan. As the intake offers it: a Field's open goal, on the chain's own
 * gate (ruling N11, topicGeminiOn: the topic switches and a key, never ROADMAP_GEMINI_LIVE; a fixture: its lead-only
 * `gemini`).
 */
export function breakDownOfferedOf(view: RoadmapView, gates?: LiveGates): boolean {
  const h = view.header;
  if (!h || !view.draft?.topicMap || view.topicChain || view.writesOff || h.area.kind !== "FIELD") return false;
  if (h.status !== "DRAFT" && h.status !== "ACTIVE") return false;
  return topicGeminiOn(view, gates);
}

/**
 * The offer itself: the same breakDown as the intake's path, on the map as it stands; the page's chain poll then takes it
 * step by step (the wait card on a fresh draft, TopicChainCard on a re-plan). Word-light: the button alone, outside the
 * map card's row-13 budget.
 */
function BreakDownOffer({ view, gates }: { view: RoadmapView; gates?: LiveGates }) {
  const { run: act, pending, error } = useRoadmapAction();
  const id = view.header?.id ?? null;
  if (!id || !breakDownOfferedOf(view, gates)) return null;
  return (
    <div className="rm-acts" data-break-down="">
      <Button disabled={pending} onClick={() => act((a) => a.breakDown(id))}>
        {BREAK_IT_DOWN_WORD}
      </Button>
      {error && <ActionError>{error}</ActionError>}
    </div>
  );
}

/** The draft header's lead on a breakdown (who did what), or null to keep the run's own lead. */
export function topicChainLeadOf(view: Pick<RoadmapView, "topicChain">): string | null {
  return view.topicChain ? chainLeadLine(view.topicChain.gemini) : null;
}

/** The drafting card's two settings: the Area and the depth (or the date, by whose it is). */
function DraftingChips({ header, today }: { header: RoadmapHeader; today: string }) {
  const date = aimDateOfHeader(header);
  const gate = header.depth != null ? depthGateOf(header.depth) : null;
  return (
    <Chips className="rm-dh-chips">
      <AreaChip area={header.area} />
      {header.depth != null ? (
        <Chip>
          {gate && <Glyph name={`stage.${gate}`} size={12} inherit />}
          <span data-wc="name">{depthName(header.depth)}</span>
        </Chip>
      ) : (
        <Chip>
          <Mark glyph={date.glyph} size={12} />
          <Fig compact={dateChipText(header, today)} speech={speakDate(dateChipText(header, today))} />
        </Chip>
      )}
    </Chips>
  );
}

// ── Revision 5, lane 9: a TOPICS accept (contracts §22.14, ruling 49) ──

/** The live LEVELS milestone a TOPICS re-plan's accept would close (STARTING or STARTED), or null. */
export function liveMilestoneOrdOf(view: Pick<RoadmapView, "current">): number | null {
  const c = view.current;
  return c && (c.goalId != null || c.starting) ? c.milestone.ord : null;
}

/** "Creates 9 Domains in Business & Finance." and, by name, the Gemini names among them (the accept names what it does). */
function TopicCreatesLine({ map, areaName }: { map: NonNullable<NonNullable<RoadmapView["draft"]>["topicMap"]>; areaName: string }) {
  const choices = acceptTopicChoicesOf(map, { keepAll: false, aftercare: null });
  if (choices.create === 0) return null;
  return (
    <p className="t-meta" style={{ margin: 0 }}>
      {createsDomainsLine(choices.create, areaName)}
      {choices.geminiNamed.length > 0 && (
        <>
          {" "}
          {geminiNamesAmongLine()}{" "}
          {choices.geminiNamed.map((n, i) => (
            <span key={n}>
              {i > 0 ? ", " : ""}
              <span data-wc="name">{n}</span>
            </span>
          ))}
          .
        </>
      )}
    </p>
  );
}
