"use client";

/**
 * /you/roadmap (lane R5; F18; final-roadmap.html). One screen per state:
 *
 *   NONE      an empty card: "Set an aim" → /you/roadmap/new
 *   RUNNING   DraftRunning (F8)        DRAFT   DraftReview (F9)
 *   ACTIVE    the living roadmap; DONE and ARCHIVED read-only history
 *
 * ACTIVE, at 344 px (one column, by CSS order): the Aim header (Aim rank and
 * Proficiency), then Now with this week's quests first, then Toward the aim,
 * then Milestones, then one "How this is worked out" disclosure (Your
 * capacity, Is this realistic?, How this was drafted, How this is measured),
 * then practice aftercare and the footer actions. From 760 px of main: two
 * columns, the reference sections open on the right. No chart and no graph
 * canvas: the pace is text. Behind-pace signals live here and on the Aim
 * card only, never on Today. Nothing is red.
 *
 * Counts read the plan's positions (RoadmapView.positions, else positionsOf
 * over the rows: a dropped milestone keeps its place), so "milestone 2 of 6"
 * agrees with the Aim card, Today and Toward the aim; the Paragon line keys on
 * rank.top.withAim. "How this was drafted" describes RoadmapView.acceptedRun,
 * the run behind the accepted plan ("Latest run" while a view lacks it).
 *
 * UI motion (ui-motion.md §3.3 screens 5, 6 and 12, §7.5–§7.6, §7.12; lane
 * R3). Fewer words, the full text one tap away (D1, D13):
 *   - Now: "Now · milestone 2 of 6" over a static elapsed bar "day 39/77"
 *     (H6); the headline "23% [ev] · [ev.measured] 09:12" with its meter (it
 *     fills from the value this viewer last saw, SEEN, either direction), a
 *     floor tick at the pay bar, "pays [c-mp] 6 × progress from 70%" (or
 *     «pays nothing» with its reason one tap away) and the pace in ink
 *     («best case» when it rests on a calibrating pass rate); the card Key
 *     holds every caption and explanation the sections dropped; steps carry
 *     their KindGlyph; the checkpoint «context only».
 *   - QUESTS_BEHIND: «Behind on new cards · 5 of 7» opens the banner; the
 *     levers stay buttons, their explanations in the (i).
 *   - Milestones: a RouteRail, one node per MilestoneRowState (pending
 *     dashed, closed struck, past due flagged; a held stage reached with
 *     "Held when you began"); ▸ on each node holds its dates, the rank it
 *     gives and its line. `reach` plays on a counted reach only (SEEN); a
 *     user's own Start pings the current node once (`start`, ACT). The
 *     current node never pulses.
 *   - Empty: an unlit RankSeal, [route], "Set an aim" with its (i), over the
 *     unlit horizon marks. Done: the rank held, "Reached … · Aim rank … ·
 *     96%" (seal) or "Closed … · the aim wasn't reached" (no seal), the
 *     read-only rail, "Set a new aim" with the history line in its (i).
 *     Legacy: «older plan» opens its banner; LEGACY_GEMINI_HIDDEN verbatim.
 *   - Blocks are marked data-wc-block (WORD_BLOCK) for the word budgets.
 */
import Link from "next/link";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Glyph, KindGlyph } from "@/components/glyph/Glyph";
import { Chips, HonestyChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip } from "@/components/glyph/InfoTip";
import { RankSeal } from "@/components/glyph/RankSeal";
import { RouteRail, type RailNode } from "@/components/glyph/RouteRail";
import { useSeenValue, type SeenKey } from "@/components/glyph/useSeen";
import { HorizonMarks } from "@/components/fx/fallbacks";
import { BAND } from "@/lib/shader/params";
import { Button } from "@/components/ui/Button";
import { Chip, ChipButton } from "@/components/ui/Chip";
import { Icon } from "@/components/ui/Icon";
import { Meter } from "@/components/ui/Meter";
import { Sheet } from "@/components/ui/Sheet";
import { SectionHeader, Switch } from "@/components/ui/Tabs";
import { TypedConfirm } from "@/components/ui/TypedConfirm";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { goalPercent } from "@/lib/goals";
import { payBar } from "@/lib/life-economy";
import { addDays, daysBetween } from "@/lib/life-day";
import {
  AIM_RANKS,
  NOT_RECORDED_HERE,
  ROADMAP_GEMINI_LIVE,
  parseMeasureKey,
  provenanceOf,
  type CurrentMilestoneView,
  type ItemDraft,
  type MilestoneFeasibility,
  type MilestoneRowView,
  type RoadmapView,
  type StartPreview,
} from "@/lib/roadmap-types";
import { writeAimHandoff } from "@/lib/roadmap-handoff";
import {
  AIM_CALL_BODY,
  AIM_CALL_HEADING,
  AIM_CALL_RANK_LINE,
  AIM_HISTORY_LINE,
  AIM_NEW_AIM,
  CHECKPOINT_KIND_WORD,
  CLOSE_SHORT_PARAGON_LINE,
  DRAFT_IT_AGAIN_WORD,
  HEALTH_LINE,
  KEEP_DATES_WORD,
  LEGACY_ACTIVE_BANNER,
  LEGACY_DRAFT_BANNER,
  LEGACY_GEMINI_HIDDEN,
  LEGACY_MEASURE_LINE,
  MILESTONE_NOTE_LINE,
  NONE_GEMINI_LINE,
  PARAGON_PARTS,
  PROVENANCE_WORDS,
  REDATE_NOTE,
  REDATE_WORD,
  SHORT_CONTEXT_ONLY,
  SHORT_GIVES_RANK,
  SHORT_HEALTH,
  SHORT_KEEPS_RANK,
  SHORT_LEGACY,
  SHORT_PAYS_NOTHING,
  SHORT_SECTION,
  START_AGAIN_AT_DEPTH_WORD,
  START_AGAIN_LINE,
  HIDE_LATER_MILESTONES,
  TIME_FIXED_LINE,
  WRITES_OFF_BANNER,
  dayLabel,
  dayWithWeekday,
  givesRankLine,
  measuredLabel,
  pacePhrase,
  paragonDepthLine,
  pastDueLine,
  paceLine,
  pauseRowLine,
  practiceKeptPausedLine,
  showNextMilestoneLine,
  shortBar,
  shortBehindNewCards,
  shortDayOf,
  shortNowOf,
  spanLabel,
  statedLine,
  topRankDepthLine,
} from "./roadmap-copy";
import { ROADMAP_NEW_HREF, TODAY_HREF, todayTaskHref } from "./roadmap-links";
import { GoalSwitcher } from "./GoalSwitcher";
import {
  activityAsksOf,
  aftercareMilestoneIdOf,
  behindBannerOf,
  domainIndexOf,
  editorRowOf,
  geminiNamedOf,
  healthChipShown,
  horizonOfRoadmap,
  paceFlagsOf,
  paragonLineShown,
  pausedItemsOf,
  pausedOfMeasure,
  positionsOf,
  practiceOnlyLineOf,
  railNodesOf,
  referenceRunOf,
  rowHealthOf,
  rowsAreProgressionOf,
  scopeNamesOf,
  seenBaseOf,
  seenBasesOfRoadmap,
  seenMeasureWhat,
  stageRunOf,
  stageWhysOf,
  startAgainOffered,
  titleItemOf,
  type LibraryDomain,
  type RankPlanEntry,
  type SeenBases,
} from "./roadmap-ui-model";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { usePauseSeen } from "./roadmap-pauses";
import { ItemEditor } from "./ItemEditor";
import { editorScopeOf, DraftReview, DraftRunning } from "./DraftReview";
import { AimHeader, AreaChipShort, spaced } from "./AimHeader";
import { TowardAim } from "./TowardAim";
import { MeasureRow, evidenceOfCaption, measureFractionOf } from "./MeasureRow";
import { DomainItemRow, DomainRow } from "./DomainRow";
import { ItemRow, MarkedLabel, MilestoneTitleText, libraryMarksOf, trackSigilOf } from "./ItemRow";
import { StruckLabel } from "./StruckLabel";
import { TopicRow } from "./TopicRow";
import { PracticeRow } from "./PracticeRow";
import { WeekQuests } from "./WeekQuests";
import { PastWeekQuests } from "./PastWeekQuests";
import { QuestBasisSheet } from "./QuestBasisSheet";
import { CheckpointSheet } from "./CheckpointSheet";
import { StartSheet } from "./StartSheet";
import { ReplanSheet } from "./ReplanSheet";
import { ThroughputPanel } from "./ThroughputPanel";
import { ChecksPanel, VerdictChip } from "./ChecksPanel";
import { RunFacts, RunTable } from "./RunFacts";
import { restartHandoffOf } from "./AimCard";
import { PlanHistory } from "./PlanHistory";
import { HowMeasuredSheet, WorkedOutSheet } from "./HowMeasuredSheet";
import { StageWhyLine } from "./MilestoneCard";
import { PaysLine } from "./PaysLine";
import { RoadmapGlyph } from "./RoadmapGlyph";
import { TitleClassChip } from "./ProvenanceChip";
import { DateBlock } from "./DateBlock";
import { GapPanel, type LiveGates } from "./GapPanel";
// ── Revision 5, lane 9: a TOPICS plan's map card and chain nodes, [Break into topics] (only while TOPIC_PLANS_LIVE) ──
import { NamedText } from "@/components/glyph/NamedMark";
import { TopicMap } from "./TopicMap";
import { railNodeTopicFieldsOf, topicGeminiOn, topicPlansOn } from "./topic-map-model";
import { BREAK_INTO_TOPICS_GEMINI_LINE, BREAK_INTO_TOPICS_LINE, BREAK_INTO_TOPICS_WORD, tailToReachLine } from "./roadmap-copy";
import { EstimateChip } from "./EstimateChip";
import { STAGE_NAMES as TOPIC_STAGE_NAMES, stageOfLevel as topicStageOfLevel, type RatingView, type RoadmapActionResult } from "@/lib/roadmap-types";
import { ActivityConfirmCard } from "./ActivityConfirm";
import "./roadmap.css";

function isLibrary(d: LibraryDomain | { id: string; name: string } | undefined): d is LibraryDomain {
  return Boolean(d && "cards" in d);
}

// ── NONE ────────────────────────────────────────────────────────────────────

/** The unlit horizon marks (no reading: hairline, path and contours only; no dawn, no canvas, no seen key). Static SVG. */
export function UnlitHorizon({ depth = null }: { depth?: number | null }) {
  const [w, h] = BAND.page;
  return (
    <div className="rm-band">
      <div className="shd shd-horizon shd-band-page" aria-hidden="true" data-shd="horizon" data-shd-state="fallback">
        <HorizonMarks w={w} h={h} front={-1} contours={typeof depth === "number" ? Math.max(0, Math.min(12, Math.round(depth))) : 0} />
      </div>
    </div>
  );
}

/**
 * NONE (F-R4-1): the ASK card's heading, body and true rank line, and "Set an
 * aim". Gemini is named only while ROADMAP_GEMINI_LIVE and a key both hold.
 * UI motion (§3.3 screen 12): an unlit RankSeal and [route] over the unlit
 * horizon; the body, the rank line and the Gemini line live in the (i).
 * Static: nothing here moves.
 */
export function EmptyRoadmap({ hasKey, gates }: { hasKey: boolean; gates?: LiveGates }) {
  const gemini = (gates?.gemini ?? ROADMAP_GEMINI_LIVE) && hasKey;
  return (
    <section className="card rm-none" aria-label="No roadmap yet" data-wc-block="roadmap-empty">
      <UnlitHorizon />
      <span className="rm-none-g" aria-hidden="true">
        <RankSeal index={0} size={72} state="idle" />
        <RoadmapGlyph name="route" size={28} />
      </span>
      <div className="rm-none-hr">
        <b className="rm-none-h">{AIM_CALL_HEADING}</b>
        <InfoTip topic="setting an aim">
          <span className="rm-tip-l">{AIM_CALL_BODY}</span>
          <span className="rm-tip-l">{AIM_CALL_RANK_LINE}</span>
          {gemini && <span className="rm-tip-l">{NONE_GEMINI_LINE}</span>}
        </InfoTip>
      </div>
      <Button variant="primary" href={ROADMAP_NEW_HREF}>
        {AIM_CALL_HEADING}
      </Button>
    </section>
  );
}

// ── Small sheets ──────────────────────────────────────────────────────────────

function RescheduleSheet({ open, onClose, goalId, ord, today }: { open: boolean; onClose: () => void; goalId: string; ord: number; today: string }) {
  const [day, setDay] = useState(addDays(today, 14));
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title={`Reschedule Milestone ${ord}`} description="A later due day counts as Carried when you close it.">
      <div className="rm-form">
        <div className="rm-f">
          <label className="st-label" htmlFor="rm-resched">
            New due day
          </label>
          <input id="rm-resched" type="date" className="st-input" min={addDays(today, 1)} value={day} onChange={(e) => setDay(e.target.value)} />
          <p className="st-hint">{dayWithWeekday(day, today)} · the goal on Today moves with it; its pay rules don&apos;t change.</p>
        </div>
        {error && <ActionError>{error}</ActionError>}
        <Button variant="primary" size="lg" block disabled={pending} onClick={() => run((a) => a.rescheduleGoal(goalId, day), () => onClose())}>
          {pending ? "Moving…" : `Move to ${dayWithWeekday(day, today)}`}
        </Button>
      </div>
    </Sheet>
  );
}

function ArchiveSheet({ open, onClose, roadmapId, openGoal }: { open: boolean; onClose: () => void; roadmapId: string; openGoal: boolean }) {
  const [archiveGoal, setArchiveGoal] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title="Archive this roadmap" description="Its history, readings, past week quests and Aim rank are kept. No new week quests are set.">
      <div className="rm-form">
        {openGoal && (
          <div className="rm-sw">
            <span className="rm-sw-t">Archive its open milestone goal too (it has progress; otherwise it stays on Today)</span>
            <Switch checked={archiveGoal} onChange={setArchiveGoal} label="Archive its open milestone goal too" />
          </div>
        )}
        <TypedConfirm phrase="archive" action="Archive roadmap" pending={pending} onConfirm={() => run((a) => a.archiveRoadmap(roadmapId, { reason: "archived by you", archiveGoal }), () => onClose())} />
        {error && <ActionError>{error}</ActionError>}
      </div>
    </Sheet>
  );
}

function MarkDoneSheet({ open, onClose, roadmapId, reached }: { open: boolean; onClose: () => void; roadmapId: string; reached: boolean }) {
  const [reason, setReason] = useState("");
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet open={open} onClose={onClose} title="Mark the aim done" description={reached ? "The aim is reached on your readings." : "The aim isn't reached on your readings yet, so say why it's done."}>
      <div className="rm-form">
        {!reached && (
          <div className="rm-f">
            <label className="st-label" htmlFor="rm-done-reason">
              Why it&apos;s done
            </label>
            <textarea id="rm-done-reason" className="st-input" rows={2} maxLength={280} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {error && <ActionError>{error}</ActionError>}
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pending}
          onClick={() => {
            if (!reached && !reason.trim()) return;
            run((a) => a.markRoadmapDone(roadmapId, reached ? null : reason.trim()), () => onClose());
          }}
        >
          {pending ? "Saving…" : "Mark done"}
        </Button>
        {!reached && !reason.trim() && <p className="t-meta">Write a reason first; it&apos;s stored with the aim.</p>}
      </div>
    </Sheet>
  );
}

// ── Now ─────────────────────────────────────────────────────────────────────

/** "measured 09:12" → "09:12" (the clock glyph says measured; the sr line keeps the words). */
function measuredAtShort(label: string): string {
  return label.replace(/^measured /, "");
}

/** The pace in ink, in the Aim card's words ("On pace for 7 Mar", "About 3 weeks behind"): pacePhrase, sentence case. */
export function pacePhraseShort(pace: Parameters<typeof pacePhrase>[0], today?: string): string | null {
  const p = pacePhrase(pace, today);
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : null;
}

/** "gives Aim rank [rank.2 active] Journeyman" (a rank not yet held keeps its verb, drawn active) or "[rank.N done] keeps your rank". */
function RankGivesLine({ rankIndex, gives, held }: { rankIndex: number | null; gives: boolean; held: number }) {
  if (rankIndex == null) return null;
  const idx = Math.max(0, Math.min(6, rankIndex));
  if (!gives)
    return (
      <p className="rm-rkg">
        <Glyph name={`rank.${Math.max(0, Math.min(6, held))}` as `rank.${0 | 1 | 2 | 3 | 4 | 5 | 6}`} state="done" size={16} inherit />
        {" "}
        <span>{SHORT_KEEPS_RANK}</span>
      </p>
    );
  return (
    <p className="rm-rkg">
      <span>{SHORT_GIVES_RANK}</span>{" "}
      <Glyph name={`rank.${idx}` as `rank.${0 | 1 | 2 | 3 | 4 | 5 | 6}`} state="active" size={16} inherit />{" "}
      <b data-wc="name">{AIM_RANKS[idx]}</b>
    </p>
  );
}

/** The static elapsed bar (H6: elapsed time is a fact, but motion on it would read as progress): "day 39/77". */
function ElapsedBar({ day, of }: { day: number; of: number }) {
  return (
    <span className="rm-el">
      <span className="rm-el-bar" aria-hidden="true">
        <i style={{ "--rm-el": Math.max(0, Math.min(1, day / of)).toFixed(3) } as CSSProperties} />
      </span>
      <span className="num" aria-hidden="true">
        {shortDayOf(day, of)}
      </span>
      <span className="sr-only">
        day {day} of {of}
      </span>
    </span>
  );
}

/** A BODY track plan (DraftReview's MilestoneCard context `body`): its cards carry the one health chip (D12). */
function bodyPlanOf(view: RoadmapView): boolean {
  const a = view.header?.area;
  return a?.kind === "TRACK" && a.track === "BODY";
}

function NowSection({ view, current, onStartOpen, seen }:{ view: RoadmapView; current: CurrentMilestoneView; onStartOpen: () => void; seen?: SeenBases | null }) {
  const m = current.milestone;
  const today = view.today;
  const index = useMemo(() => domainIndexOf(view), [view]);
  // The live fix (§22.11): a kept Gemini-named Domain's name in a step's words keeps pv.named (the title and the ItemRows read the editor's library).
  const namedMarks = useMemo(() => libraryMarksOf(view.library), [view.library]);
  const [basis, setBasis] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [resched, setResched] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const rows = view.milestones;
  // Positions, as the Aim card, Today's chip and Toward the aim count them (a dropped milestone keeps its place).
  const of = positionsOf(view);
  const started = Boolean(current.goalId);
  const checkpoint = m.items.find((it) => it.kind === "CHECKPOINT" && it.decision !== "REMOVED") ?? null;
  const windowDays = m.windowStart && m.dueDay ? daysBetween(m.windowStart, m.dueDay) + 1 : null;
  const dayN = m.windowStart && windowDays ? Math.max(1, Math.min(windowDays, daysBetween(m.windowStart, today) + 1)) : null;
  const fractions = current.measures.filter((x) => x.role === "PAYS").map((x) => ({ key: x.measureKey, g: measureFractionOf(x) }));
  const slowest = fractions.length > 1 ? fractions.reduce((a, b) => ((b.g ?? 1) < (a.g ?? 1) ? b : a)).key : null;
  const headPct = current.headline ? goalPercent(Number(current.headline.value)) : null;
  // A stored reading keeps its real "measured" time even with writes off; only a value computed here reads NOT_RECORDED_HERE.
  const headMeasuredAt = current.measures.find((x) => x.measuredAt)?.measuredAt ?? null;
  const headMeasured = headMeasuredAt ? measuredLabel(headMeasuredAt, today) : view.writesOff ? NOT_RECORDED_HERE : "not measured yet";
  const prevBest = Math.max(0, ...rows.filter((r) => r.ord < m.ord && r.rankIndex != null).map((r) => r.rankIndex!));
  const heldRank = view.rank?.index ?? prevBest;
  // Constraint safety (contracts §19): while the plan waits on the user's answer about activities.
  const practiceOnly = practiceOnlyLineOf(view.activityConfirm);
  // Started practices and steps an answer touched (decision 4): how each stands — off Today, still there (its pause refused), back by
  // Undo, or no longer avoided — said on its row, and under a Practice kept that no longer pays (the lead's ruling 3). What this tab
  // saw happen to each task (the save's reply, the notice's Undo) is roadmap-pauses'.
  const pausedSeen = usePauseSeen(view.header?.id);
  const paused = started ? pausedItemsOf(current, view.activityConfirm, pausedSeen) : [];
  const pausedOf = new Map(paused.map((p) => [p.lineageId, p] as const));
  const rankGives = m.rankIndex != null && m.rankIndex > prevBest;
  // The practice progression (contracts §20): why this stage holds what it practises, from what it holds (a revision-4 stage of a plan
  // whose rows are code's progression: any writer but a v3 reply; the stage before's rows aren't in the view, so no "builds on" here).
  // The plan's track, exam and gate (the editor scope's: what the type picker leaves out), so a stage's options are the ones Gemini was offered.
  const nowScope = editorScopeOf(view, [m]);
  const stageRun = nowScope ? stageRunOf(nowScope) : null;
  const why = stageRun && m.stage && rowsAreProgressionOf(referenceRunOf(view).run) ? (stageWhysOf([m], stageRun).get(m.lineageId) ?? null) : null;
  // The pace of the slowest part, in ink (never red); «best case» when it rests on a calibrating pass rate (D28).
  const headPace = current.measures.find((x) => x.measureKey === slowest)?.pace ?? current.measures[0]?.pace ?? null;
  const paceFull = paceLine(headPace, { today });
  const paceShort = pacePhraseShort(headPace, today);
  const paceBest = paceFlagsOf(headPace).bestCase;
  // meter-fill (SEEN): the headline fills from the value this viewer last saw, under the plan's basis and the same targets (D8).
  const plan = seenBaseOf(seen ?? null, "plan");
  const headKey: SeenKey | null =
    plan && current.headline ? { ...plan, what: seenMeasureWhat(`headline:${m.lineageId}@${current.measures.map((x) => `${x.measureKey}=${x.target}`).join(",")}`) } : null;
  const headFrom = useSeenValue(headKey, current.headline ? Number(current.headline.value) : 0);
  const pays = current.stated != null && current.stated > 0;
  const statedFull = statedLine(current.stated, current.zeroReason, current.paidOn, today);

  const items = (kind: ItemDraft["kind"]) => m.items.filter((it) => it.kind === kind && it.decision !== "REMOVED").sort((a, b) => a.ord - b.ord);
  // The plan's own track sigil (a Practice row's quest glyph, as the card's PracticeRows draw it; §4.4).
  const nowTrack = trackSigilOf(nowScope);
  // D12: one «Not medical advice · ask a professional» on the Now card of a body plan (or one with health rows), unless a HEALTH flag
  // already shows the line; its rows and its week quests then drop their own (MilestoneCard's rule, so the two cards agree).
  const liveItems = m.items.filter((it) => it.decision !== "REMOVED");
  const healthFlag = titleItemOf(m).flags.includes("HEALTH") || liveItems.some((it) => it.flags.includes("HEALTH"));
  const healthChip = healthChipShown({
    track: bodyPlanOf(view) ? "BODY" : null,
    healthRows: m.notes.includes("HEALTH_LINE") || liveItems.some((it) => it.kind === "PRACTICE" && it.method === "WORKOUT") || Boolean(started && view.weekQuests?.rows.some(rowHealthOf)),
    healthFlagShown: healthFlag,
  });
  // The card says HEALTH_LINE once (its chip, or a HEALTH flag's reason): the rows and the week quests never add their own.
  const healthSaid = healthChip || healthFlag;
  const sec = (title: string, body: ReactNode) => (
    <div className="rm-ms-sec">
      <div className="rm-ms-sh">
        <span className="t-eyebrow">{title}</span>
      </div>
      {body}
    </div>
  );
  // The card Key (D13): each glyph the card draws with its words, and the captions the sections dropped.
  const keyRows: ReactNode[] = [
    started ? (
      <>
        Mid goal on Today · <PaysLine text={statedFull} />
      </>
    ) : current.stated != null ? (
      <>
        Becomes a Mid goal on Today · <PaysLine text={statedFull} />
      </>
    ) : null,
    current.headline ? `${current.headline.caption} · ${headMeasured}` : null,
    current.headline ? `The slowest part sets the milestone${paceFull ? ` · ${paceFull}` : "."}` : null,
    current.measures.length > 0 ? "Measures: the same numbers as Today's goal card" : null,
    items("DOMAIN").length > 0 ? "Domains: from your library" : null,
    items("TOPIC").length > 0 ? `${SHORT_SECTION.learn}: write cards on it in its Domain; review them when due` : null,
    items("PRACTICE").length > 0 || practiceOnly ? `What to practise: ${started ? "on Today under this goal" : "goes to Today when you start it"}` : null,
    items("STEP").length > 0 ? "Steps: you tick these" : null,
    checkpoint ? "Checkpoint: you log it · doesn't move your progress" : null,
  ].filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <div className="rm-o2" id="now" data-wc-block="now">
      <SectionHeader title={shortNowOf(m.ord, of || m.ord)} aside={dayN && windowDays ? <ElapsedBar day={dayN} of={windowDays} /> : undefined} />
      <section className="card" aria-label="Current milestone">
        <div className="rm-ms-h">
          <span className="rm-ms-n rm-ms-n-cur">{m.ord}</span>
          <div>
            <p data-wc="name" className="rm-ms-t">
              <MilestoneTitleText milestone={m} />
            </p>
            <StageWhyLine why={why} track={stageRun?.track} />
            <div className="rm-ms-w">{spanLabel(m.windowStart, m.dueDay, today)}</div>
            <div className="rm-chips rm-now-chips">
              <Chip>{current.pastDue ? "Past due" : current.starting ? "Starting" : started ? "Current" : "Planned"}</Chip>
              <TitleClassChip cls={provenanceOf(m.titleOrigin, m.titleDecision)} />
              <CardKey
                topic={`milestone ${m.ord}`}
                entries={[
                  { glyph: "ev.tested", words: "tested by your reviews" },
                  { glyph: "ev.tick", words: "from your ticks" },
                  { glyph: "ev.measured", words: "measured at (time)" },
                  { glyph: "c-mp", words: "the stated pay, from the pay bar (the tick on the meter)" },
                  { glyph: "pace.on", words: "the pace of the slowest part" },
                  { glyph: "quest.step", words: "a step: you tick it" },
                ]}
                rows={keyRows}
              />
            </div>
            <RankGivesLine rankIndex={m.rankIndex} gives={rankGives} held={heldRank} />
          </div>
        </div>

        {healthChip && (
          // A safety surface (D11): static at every level, its panel opens instantly.
          <div className="rm-ms-sec" data-safety="">
            <HonestyChip kind="health" label={SHORT_HEALTH} full={HEALTH_LINE} wrap />
          </div>
        )}

        {current.pastDue && (
          <div className="rm-ms-sec">
            <p className="t-body" style={{ fontWeight: 600, margin: 0 }}>
              {pastDueLine(m.ord, m.dueDay, today)}
            </p>
            <p className="t-meta" style={{ marginTop: 4 }}>
              No week quests this week. The goal on Today is Carried, never owed.
            </p>
            {view.header?.depth != null && <p className="t-meta">{CLOSE_SHORT_PARAGON_LINE}</p>}
            <div className="rm-acts">
              {current.goalId && <ChipButton onClick={() => setResched(true)}>Reschedule Milestone {m.ord}</ChipButton>}
              <Link className="chip btn-chip" href={TODAY_HREF}>
                Close it on Today
              </Link>
            </div>
            <PastWeekQuests weeks={view.pastWeeks} today={today} />
          </div>
        )}

        {started && (
          <div className="rm-ms-sec">
            {current.headline ? (
              <>
                <div className="rm-head">
                  <span className="rm-big" aria-hidden="true">
                    {headPct}%
                  </span>
                  <span className="sr-only">{`Milestone ${m.ord}: ${headPct}%, ${current.headline.caption}, ${headMeasured}`}</span>
                  <span className="rm-head-ev" aria-hidden="true">
                    {evidenceOfCaption(current.headline.caption).map((e) => (
                      <Glyph key={e} name={e} size={14} inherit />
                    ))}
                    {headMeasuredAt ? (
                      <>
                        {" "}
                        <span className="rm-sep">·</span>{" "}
                        <Glyph name="ev.measured" size={14} inherit />
                        <span className="num">{measuredAtShort(headMeasured)}</span>
                      </>
                    ) : (
                      <span>{headMeasured}</span>
                    )}
                  </span>
                </div>
                <span className="rm-floor">
                  <Meter className="rm-head-m" value={Number(current.headline.value)} from={headFrom} label={`Milestone ${m.ord}, ${headPct}%, ${current.headline.caption}`} />
                  {pays && <i className="rm-floor-t" aria-hidden="true" style={{ left: `${Math.round(payBar("MID") * 100)}%` }} />}
                </span>
                <p className="rm-head-pay">
                  {pays ? <PaysLine text={statedFull} /> : <HonestyChip kind="pays-nothing-ms" label={SHORT_PAYS_NOTHING} full={statedFull} />}
                </p>
                {paceShort && (
                  <p className="rm-pace">
                    <Glyph name={headPace?.kind === "behind" || headPace?.kind === "short" || headPace?.kind === "far" ? "pace.behind" : "pace.on"} size={16} inherit />
                    <span>{paceShort}</span>
                    {paceBest && " "}
                    {paceBest && <HonestyChip kind="best-case" />}
                  </p>
                )}
              </>
            ) : (
              <p className="t-meta">{view.writesOff ? "Not recorded on this server." : "Not measured yet — the first reading is recorded when you next open Today or You in the app."}</p>
            )}
          </div>
        )}

        {!current.pastDue && view.weekQuests && started && (
          <>
            <WeekQuests
              variant="roadmap"
              view={view.weekQuests}
              today={today}
              onShowBasis={() => setBasis(true)}
              onLogCheckpoint={checkpoint ? () => setLogOpen(true) : undefined}
              shownElsewhere={view.triggers.map((t) => t.line)}
              bases={seen}
              track={nowTrack}
              health={healthSaid ? false : undefined}
            />
            <div className="rm-ms-sec" style={{ borderTop: 0, paddingTop: 0 }}>
              <PastWeekQuests weeks={view.pastWeeks} today={today} />
            </div>
            <QuestBasisSheet open={basis} onClose={() => setBasis(false)} view={view.weekQuests} today={today} />
          </>
        )}

        {current.measures.length > 0 &&
          sec(
            "Measures",
            current.measures
              .filter((x) => x.kind !== "CHECKPOINT")
              .map((x) => {
                const parsed = parseMeasureKey(x.measureKey);
                const names = parsed?.kind === "CARDS_AT_LEVEL" ? scopeNamesOf(parsed.domainIds, index) : null;
                const label = x.label ?? (parsed?.kind === "CARDS_AT_LEVEL" ? `Cards at level ${parsed.level}+ in ${names ?? "this milestone's Domains"}` : "Practice kept");
                return (
                  <MeasureRow
                    key={x.measureKey}
                    row={x}
                    label={label}
                    m={view.feasibility?.m ?? 1}
                    today={today}
                    slowest={slowest === x.measureKey}
                    since="since start"
                    writesOff={view.writesOff}
                    note={practiceKeptPausedLine(pausedOfMeasure(x, paused), today)}
                    scope={names}
                    seen={plan}
                  />
                );
              })
          )}

        {items("DOMAIN").length > 0 &&
          sec(
            "Domains",
            items("DOMAIN").map((it) => {
              const f = it.domainId ? index.get(it.domainId) : undefined;
              const cls = provenanceOf(it.origin, it.decision);
              if (!it.domainId || (cls !== "YOURS" && cls !== "WORKED_OUT"))
                return <DomainItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" facts={isLibrary(f) ? f : null} />;
              return <DomainRow key={it.id ?? it.lineageId} name={it.label} domainId={it.domainId} facts={isLibrary(f) ? f : null} createdNote={it.origin === "USER" ? "you created it" : null} />;
            })
          )}

        {items("TOPIC").length > 0 &&
          sec(
            SHORT_SECTION.learn,
            items("TOPIC").map((it) => {
              const f = it.domainId ? index.get(it.domainId) : undefined;
              return <TopicRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" domainName={f?.name ?? it.proposedName} facts={isLibrary(f) ? f : null} />;
            })
          )}

        {(items("PRACTICE").length > 0 || practiceOnly) &&
          sec(
            "What to practise",
            <>
              {practiceOnly && <p className="rm-avd-p rm-avd-ms">{practiceOnly}</p>}
              {items("PRACTICE").map((it) => (
                <PracticeRow
                  key={it.id ?? it.lineageId}
                  target={{ row: editorRowOf(it), item: it, milestone: m }}
                  stage="active"
                  kept={current.practiceKept?.[it.lineageId] ?? null}
                  paused={pausedOf.get(it.lineageId) ?? null}
                  today={today}
                  health={healthSaid ? "card" : "row"}
                />
              ))}
            </>
          )}

        {m.notes.some((n) => !(n === "HEALTH_LINE" && healthSaid)) && (
          <div className="rm-ms-sec">
            {m.notes.filter((n) => !(n === "HEALTH_LINE" && healthSaid)).map((n) => (
              <p key={n} className="t-meta" style={{ margin: 0 }}>
                {MILESTONE_NOTE_LINE[n]}
              </p>
            ))}
          </div>
        )}

        {items("STEP").length > 0 &&
          sec(
            "Steps",
            items("STEP").map((it) => {
              const done = current.stepDone?.[it.lineageId] ?? null;
              const cls = provenanceOf(it.origin, it.decision);
              if (cls === "DRAFT" || cls === "KEPT_SUGGESTION") return <ItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone: m }} stage="active" kindLabel="Step" />;
              return done ? (
                <div key={it.id ?? it.lineageId} className="rm-dr rm-step">
                  <KindGlyph kind="step" state="done" size={20} />
                  <div>
                    <p className="rm-it-l" data-wc={cls === "YOURS" ? "own" : undefined}>
                      <MarkedLabel label={it.label} marks={namedMarks} />
                    </p>
                    <div className="rm-it-m">done {dayWithWeekday(done, today)}</div>
                  </div>
                </div>
              ) : (
                <div key={it.id ?? it.lineageId} className="rm-dr rm-step" style={{ paddingBottom: 0 }}>
                  <KindGlyph kind="step" state="idle" size={20} />
                  <div>
                    <p className="rm-it-l" data-wc={cls === "YOURS" ? "own" : undefined}>
                      <MarkedLabel label={it.label} marks={namedMarks} />
                    </p>
                    {started && it.templateId && (
                      <div className="rm-it-m">
                        {pausedOf.has(it.lineageId) && `${pauseRowLine(pausedOf.get(it.lineageId)!, today)}${pausedOf.get(it.lineageId)!.offToday ? "" : " "}`}
                        {!pausedOf.get(it.lineageId)?.offToday && (
                          <Link className="rm-ilink" href={todayTaskHref(it.templateId)}>
                            On Today
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}

        {checkpoint && (
          <div className="rm-ms-sec" id="checkpoint">
            <div className="rm-ms-sh">
              <span className="t-eyebrow">Checkpoint</span>
              <span className="rm-cap" data-wc="honest">{SHORT_CONTEXT_ONLY}</span>
            </div>
            {/* Through ItemRow, so its words keep their chip (a kept checkpoint still reads "Gemini's words …") and its ⋯. */}
            <ItemRow
              target={{ row: editorRowOf(checkpoint), item: checkpoint, milestone: m }}
              stage="active"
              kindLabel={checkpoint.checkpointKind ? CHECKPOINT_KIND_WORD[checkpoint.checkpointKind] : "a test of your own"}
              meta={
                <>
                  {current.checkpointLog ? `you logged ${current.checkpointLog.score}/${current.checkpointLog.outOf} on ${dayLabel(current.checkpointLog.day, today)}` : null}
                  {current.checkpointLog && checkpoint.bar != null && checkpoint.outOf != null ? " · " : null}
                  {checkpoint.bar != null && checkpoint.outOf != null ? shortBar(checkpoint.bar, checkpoint.outOf) : current.checkpointLog ? null : "no score logged yet"}
                  <span className="sr-only"> · doesn&apos;t move your progress</span>
                </>
              }
            >
              {started && (
                <div className="rm-acts">
                  <ChipButton onClick={() => setLogOpen(true)}>Log a score</ChipButton>
                </div>
              )}
            </ItemRow>
            <CheckpointSheet open={logOpen} onClose={() => setLogOpen(false)} item={checkpoint} />
          </div>
        )}

        {!started && !current.starting && !current.pastDue && (
          <div className="rm-ms-sec">
            {current.stated != null && (
              <p className="rm-head-pay" style={{ marginTop: 0 }}>
                {pays ? <PaysLine text={statedFull} /> : <HonestyChip kind="pays-nothing-ms" label={SHORT_PAYS_NOTHING} full={statedFull} />}
              </p>
            )}
            {view.goalsLive ? (
              <Button variant="primary" block style={{ marginTop: 12 }} onClick={onStartOpen}>
                Start milestone {m.ord}
              </Button>
            ) : (
              <p className="t-meta rm-ink1" style={{ marginTop: 8 }}>
                Starting milestones arrives with the next update.
              </p>
            )}
          </div>
        )}

        {current.starting && (
          <div className="rm-ms-sec">
            <p className="t-body" style={{ margin: 0 }}>
              Starting milestone {m.ord} didn&apos;t finish.
            </p>
            <div className="rm-acts">
              <Button variant="primary" disabled={pending} onClick={() => m.id && run((a) => a.finishStarting(m.id!))}>
                Finish starting
              </Button>
              <Button variant="quiet" disabled={pending} onClick={() => m.id && run((a) => a.returnStarting(m.id!))}>
                Return it to planned
              </Button>
            </div>
            {error && <ActionError>{error}</ActionError>}
          </div>
        )}
      </section>
      {current.goalId && <RescheduleSheet open={resched} onClose={() => setResched(false)} goalId={current.goalId} ord={m.ord} today={today} />}
    </div>
  );
}

// ── Triggers and levers ─────────────────────────────────────────────────────

/**
 * CALIBRATED (F-R4-11): an input the date assumed is now measured. [Re-date]
 * runs the REFIT re-date over unstarted stages only (counts and levels never
 * fall); [Keep the dates] leaves the dates as they are and records that on
 * the plan (R4's keepCalibratedDates: the measured inputs leave
 * dateOrigin.calibrating, so the offer is answered on every device and the
 * chip stops saying "estimate" for them; the contract §15.10). The re-date
 * note sits in the (i) (D1).
 */
function CalibratedOffer({ view, line }: { view: RoadmapView; line: string }) {
  const header = view.header!;
  const [kept, setKept] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  if (kept) return null;
  return (
    <section className="card rm-banner" aria-label="Your inputs are measured">
      <div className="rm-banner-t">
        <p style={{ margin: 0 }}>
          {line}{" "}
          <InfoTip topic="re-dating">{REDATE_NOTE}</InfoTip>
        </p>
      </div>
      <div className="rm-acts" style={{ marginTop: 0 }}>
        <Button variant="primary" disabled={pending} onClick={() => run((a) => a.replan(header.id, "REFIT"))}>
          {REDATE_WORD}
        </Button>
        <Button variant="quiet" disabled={pending} onClick={() => run((a) => a.keepCalibratedDates(header.id), () => setKept(true))}>
          {KEEP_DATES_WORD}
        </Button>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </section>
  );
}

/** "Behind on new cards · 5 of 7" from the QUESTS_BEHIND sentence ("… asks 5 of the 7 needed …"); its own head when the counts aren't in it. */
export function behindChipLabelOf(line: string, head: string): string {
  const m = /asks (\d+) of the (\d+) needed/.exec(line);
  return m ? shortBehindNewCards(Number(m[1]), Number(m[2])) : head;
}

/**
 * The triggers above Now. QUESTS_BEHIND (ui-motion.md §3.3 screen 5): one card
 * with «[pace.behind] Behind on new cards · 5 of 7» (it opens the banner's
 * sentence, said once) and the levers as buttons; what each lever does is in
 * the (i). CALIBRATED offers Re-date and Keep the dates. The rest keep their
 * lines and Re-plan.
 */
function Triggers({ view, current, onReplan }: { view: RoadmapView; current: CurrentMilestoneView | null; onReplan: () => void }) {
  const [resched, setResched] = useState(false);
  const { run, pending, error } = useRoadmapAction();
  const behind = view.triggers.find((t) => t.trigger === "QUESTS_BEHIND");
  const calibrated = view.triggers.find((t) => t.trigger === "CALIBRATED");
  const others = view.triggers.filter((t) => t.trigger !== "QUESTS_BEHIND" && t.trigger !== "CALIBRATED");
  const depthPlan = view.header?.depth != null;
  if (view.triggers.length === 0) return null;
  const ord = current?.milestone.ord ?? behind?.milestoneOrd ?? 0;
  const banner = behind ? behindBannerOf(behind.line, ord) : null;
  const later = view.milestones.filter((r) => r.ord > ord && r.state !== "LATER").map((r) => r.ord);
  const laterLine = later.length > 1 ? `Milestones ${later[0]} to ${later[later.length - 1]}` : later.length === 1 ? `Milestone ${later[0]}` : "later milestones";
  return (
    <div className="rm-o2 rm-stack" data-wc-block="aim-notes">
      {behind && (
        <>
          <section className="card pad rm-behind" aria-label={`What acts on Milestone ${ord}`}>
            <Chips>
              <HonestyChip
                kind="behind"
                label={behindChipLabelOf(behind.line, banner!.head)}
                wrap
                full={
                  <>
                    <b>{banner!.head}</b> {banner!.body}
                  </>
                }
              />
              <InfoTip topic={`what acts on Milestone ${ord}`}>
                {current?.goalId && <span className="rm-tip-l">Reschedule: a later due day counts as Carried when you close it.</span>}
                {current?.stated != null && current.stated > 0 && (
                  <span className="rm-tip-l">
                    Or let it close short: it <PaysLine text={statedLine(current.stated, null)} />.
                  </span>
                )}
                {depthPlan && <span className="rm-tip-l">{CLOSE_SHORT_PARAGON_LINE}</span>}
                {later.length > 0 && (
                  <span className="rm-tip-l">
                    {depthPlan ? `This re-dates ${laterLine}; it never lowers a count or a level, and it doesn't change Milestone ${ord}.` : `This re-fits ${laterLine}; it doesn't change Milestone ${ord}.`}
                  </span>
                )}
              </InfoTip>
            </Chips>
            <div className="rm-lever">
              {current?.goalId && (
                <Button variant="primary" className="rm-btn-wrap" onClick={() => setResched(true)}>
                  Reschedule Milestone {ord}
                </Button>
              )}
              {later.length > 0 && (
                <Button className="rm-btn-wrap" disabled={pending} onClick={() => run((a) => a.replan(view.header!.id, "REFIT"))}>
                  {depthPlan ? "Re-date later milestones" : "Re-fit later milestones"}
                </Button>
              )}
              {error && <ActionError>{error}</ActionError>}
            </div>
          </section>
          {current?.goalId && <RescheduleSheet open={resched} onClose={() => setResched(false)} goalId={current.goalId} ord={ord} today={view.today} />}
        </>
      )}
      {calibrated && <CalibratedOffer view={view} line={calibrated.line} />}
      {others.length > 0 && (
        <section className="card rm-banner">
          <div className="rm-banner-t">
            {others.map((t) => (
              <p key={`${t.trigger}-${t.milestoneOrd}`} style={{ margin: "0 0 4px" }}>
                {t.line}
              </p>
            ))}
          </div>
          <Button variant="primary" onClick={onReplan}>
            Re-plan
          </Button>
        </section>
      )}
    </div>
  );
}

// ── Milestones ──────────────────────────────────────────────────────────────

/** The milestones behind you: reached (counted or not yet), dropped, closed unreached. The rail opens on the first one after them. */
const MILESTONE_BEHIND: ReadonlySet<string> = new Set(["REACHED", "PENDING_REACH", "DROPPED", "CLOSED_UNREACHED"]);

function StartAgain({ row }: { row: MilestoneRowView }) {
  const { run, pending, error } = useRoadmapAction();
  return (
    <>
      <p className="t-meta">{START_AGAIN_LINE}</p>
      <div className="rm-acts" style={{ marginTop: 4 }}>
        <ChipButton
          disabled={pending}
          onClick={() => run((a) => a.startAgain(row.id), () => pushToast({ title: `Milestone ${row.ord} planned again`, body: "Start it from Now when you're ready." }))}
        >
          Start again
        </ChipButton>
      </div>
      {error && <ActionError>{error}</ActionError>}
    </>
  );
}

/** Which rows give a rank (F-R4-12): a stage held when you began gives none and doesn't raise the bar; the rest give one above the best before them. */
export function rankPlanOfRows(rows: readonly MilestoneRowView[]): Record<string, RankPlanEntry> {
  let best = 0;
  const out: Record<string, RankPlanEntry> = {};
  for (const r of [...rows].sort((a, b) => a.ord - b.ord)) {
    if (r.held || r.rankIndex == null) continue;
    out[r.id] = { rankIndex: r.rankIndex, gives: r.rankIndex > best, paragonAfter: false };
    best = Math.max(best, r.rankIndex);
  }
  return out;
}

/**
 * The milestones as a RouteRail (ui-motion.md §3.3 screen 6, §4.5): one node
 * per MilestoneRowState (railNodesOf), LATER rows after them as thin rings;
 * a node's title keeps its Gemini chip with the who-word (D25); its ▸ holds
 * the dates, the rank it gives ("gives Aim rank → X", never the name alone),
 * its full line, the link to Now and Start again. `reach` (SEEN) plays on a
 * counted reach only; `start` (ACT) pings the current node once after the
 * user's own Start. The Paragon or depth line sits in the card's (i).
 */
function MilestonesList({
  rows,
  today,
  targetDay,
  open,
  positions,
  paragon,
  depthLine,
  seen,
  startTick,
  chain = null,
}: {
  rows: readonly MilestoneRowView[];
  today: string;
  targetDay: string;
  open: boolean;
  /** The plan's positions (positionsOf): the count every surface reads. */
  positions: number;
  /** The Aim rank's own top says Paragon comes with the aim (rank.top.withAim). */
  paragon: boolean;
  /** Revision 4: a depth plan's own line under the list (the Paragon conditions, or what keeps Paragon closed); replaces rev 3's. */
  depthLine?: string | null;
  /** The plan's seen basis (reach); none: nothing animates. */
  seen?: SeenBases | null;
  /** Bumped after the user's own Start (ACT). */
  startTick?: number;
  /** Revision 5, lane 9 (ui-motion §15.6): a TOPICS plan's chain heading: the EstimateChip, then "· +1 to reach Fluent". */
  chain?: { rating: RatingView; tail: string | null; roadmapId: string } | null;
}) {
  const [extra, setExtra] = useState(0);
  const plan = rankPlanOfRows(rows);
  const model = railNodesOf(rows, { today, plan });
  // railNodesOf keeps the rows in place order with LATER left out, one node per row.
  const placed = rows.filter((x) => x.state !== "LATER").sort((a, b) => a.ord - b.ord);
  const later = rows.filter((r) => r.state === "LATER").sort((a, b) => a.ord - b.ord);
  const title = (r: MilestoneRowView) =>
    r.titleParts && r.titleParts.length > 0 ? (
      // Revision 5, lane 9: a TOPICS title in NamedParts (the 344 short form), pv.named after each Gemini-named Domain
      <span data-wc="name">
        <b>
          <NamedText parts={r.titleParts} />
        </b>
      </span>
    ) : (
      <span data-wc="name">
        <b>
          <StruckLabel label={r.title} struck={r.titleStruck} />
        </b>
        <TitleClassChip cls={r.titleClass} />
      </span>
    );
  const nodes: RailNode[] = model.map((n, i) => {
    const r: MilestoneRowView | undefined = placed[i];
    const entry = r ? plan[r.id] : undefined;
    const giving = entry && entry.gives && entry.rankIndex != null && n.state !== "REACHED" && n.state !== "PENDING_REACH" && n.state !== "DROPPED" && n.state !== "CLOSED_UNREACHED" && !n.heldAtStart;
    const givesFull = giving ? givesRankLine(entry.rankIndex, true) : null;
    const idx = entry?.rankIndex ?? 0;
    const pct = r && !n.heldAtStart && r.percent != null && n.state !== "CLOSED_UNREACHED" ? `${r.percent}%` : null;
    // Revision 5, lane 9: a TOPICS row's layer, role, lock and hold ({} on LEVELS: the node is unchanged). A held layer is not a reach.
    const topic = r ? railNodeTopicFieldsOf(r) : {};
    return {
      ...topic,
      n: n.n,
      // RouteRail badges every OUTLINE node with Gemini's balloon; an outline row in the app's words is drawn as the same
      // thin ring without it (its words still say "Outline"), so the badge never claims Gemini wrote it (D25, D27).
      state: topic.heldLayer && r ? r.state : n.state === "OUTLINE" && !n.gemini ? "PLANNED" : n.state,
      label: `${n.label}${n.gemini && n.titleClass ? ` · ${PROVENANCE_WORDS[n.titleClass === "KEPT_SUGGESTION" ? "KEPT_SUGGESTION" : "DRAFT"]}` : ""}${pct ? ` · ${pct}` : ""}`,
      title: r ? title(r) : n.title,
      meta: topic.heldLayer ? undefined : (n.meta ?? undefined),
      aside: pct ?? undefined,
      pct: n.pct,
      gate: n.gate ?? undefined,
      rankIndex: topic.heldLayer ? null : n.rankIndex,
      countsFrom: n.countsFrom ?? undefined,
      closedPct: n.closedPct,
      more: (
        <>
          {/* The title's words class, in full (D13: the sr label's provenance is one tap away). */}
          {n.gemini && n.titleClass && <p className="t-meta">{PROVENANCE_WORDS[n.titleClass === "KEPT_SUGGESTION" ? "KEPT_SUGGESTION" : "DRAFT"]}</p>}
          {n.more
            .filter((l) => l !== givesFull)
            .map((l) => (
              <p key={l} className="t-meta">
                {l}
              </p>
            ))}
          {givesFull && (
            <p className="t-meta rm-rr-gives">
              <Glyph name={`rank.${Math.max(0, Math.min(6, idx))}` as `rank.${0 | 1 | 2 | 3 | 4 | 5 | 6}`} state="active" size={16} inherit />
              <span aria-hidden="true">
                {SHORT_GIVES_RANK} → {AIM_RANKS[Math.max(0, Math.min(6, idx))]}
              </span>
              <span className="sr-only">{givesFull}</span>
            </p>
          )}
          {n.state === "CURRENT" && (
            <p className="t-meta">
              <a className="rm-ilink" href="#now">
                Its week quests and measures are in Now
              </a>
            </p>
          )}
          {r && startAgainOffered(r, rows, open) && <StartAgain row={r} />}
        </>
      ),
    };
  });
  for (const r of later) {
    nodes.push({
      n: r.ord,
      state: "LATER",
      label: `Milestone ${r.ord} · ${r.title} · Later · no dates`,
      title: title(r),
      meta: "Later",
      more: <p className="t-meta">No dates: a Later milestone gets its dates when a re-plan brings it back.</p>,
    });
  }
  // Step by step: the milestones up to the first one not behind you show; each later one is one deliberate tap away
  // ("Show milestone 4"), and stays in the markup, hidden, until then.
  const focus = nodes.findIndex((x) => !MILESTONE_BEHIND.has(x.state));
  const through = focus < 0 ? nodes.length - 1 : focus + extra;
  const stepped = nodes.map((x, i) => (i > through ? { ...x, hidden: true } : x));
  const waiting = stepped.filter((x) => x.hidden);
  return (
    <div className="rm-o4" data-wc-block="milestones">
      <SectionHeader title="Milestones" aside={`${positions} · to ${dayLabel(targetDay, today)}`} />
      <section className="card rm-ml-card" aria-label="Milestones">
        {chain && (
          <div className="rm-ml-chain">
            <EstimateChip rating={chain.rating} tail={chain.tail} seenKey={seenBaseOf(seen ?? null, "plan")} today={today} />
          </div>
        )}
        <RouteRail nodes={stepped} seenKey={seenBaseOf(seen ?? null, "plan")} startTick={startTick} label="Milestones" className="rm-rail" />
        {(waiting.length > 0 || extra > 0) && (
          <div className="rm-ml-step">
            {waiting.length > 0 && (
              <button type="button" className="rm-ml-next" onClick={() => setExtra((e) => e + 1)}>
                <Icon name="chev" size={14} aria-hidden="true" />
                {showNextMilestoneLine(waiting[0].n, waiting.length - 1)}
              </button>
            )}
            {extra > 0 && (
              <button type="button" className="link rm-ml-less" onClick={() => setExtra(0)}>
                {HIDE_LATER_MILESTONES}
              </button>
            )}
          </div>
        )}
        {(depthLine || paragon) && (
          <div className="rm-ml-foot">
            <Glyph name="rank.6" state="idle" size={20} />
            <InfoTip topic="the top rank">{depthLine ?? `${PARAGON_PARTS.lead} ${PARAGON_PARTS.name}.`}</InfoTip>
          </div>
        )}
      </section>
    </div>
  );
}

// ── Reference ───────────────────────────────────────────────────────────────

/**
 * A started milestone's Start snapshot (R4's CurrentMilestoneView
 * startFeasibility and startedDay; the contract §15.11): the figures its
 * target was worked out from when it started.
 */
export function startSnapshotOf(current: CurrentMilestoneView): { feasibility: MilestoneFeasibility; day: string } | null {
  if (!current.goalId) return null;
  return current.startFeasibility && current.startedDay ? { feasibility: current.startFeasibility, day: current.startedDay } : null;
}

function Reference({ view, current, gates }: { view: RoadmapView; current: CurrentMilestoneView | null; gates?: LiveGates }) {
  const [open, setOpen] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [worked, setWorked] = useState(false);
  const header = view.header!;
  const f = view.feasibility;
  // A started milestone's check is its Start snapshot ("worked out at Start on 21 Dec", figures "then"); otherwise the acceptance's, labelled with its day.
  const startCheck = current ? startSnapshotOf(current) : null;
  const cur = current ? (startCheck?.feasibility ?? f?.milestones.find((x) => x.lineageId === current.milestone.lineageId) ?? null) : null;
  const asOf = startCheck ? { kind: "START" as const, day: startCheck.day } : header.acceptedDay ? { kind: "ACCEPTED" as const, day: header.acceptedDay } : null;
  // The other milestones as accepted: never the current lineage (its own check is above), each keyed by place (a lineage can repeat).
  const others = f ? f.milestones.filter((x) => x !== cur && (!current || x.lineageId !== current.milestone.lineageId)) : [];
  const drafted = referenceRunOf(view);
  // Gemini is named in the sheet only while its path is live with a key, or when a Gemini run arranged this plan.
  const gemini = geminiNamedOf((gates?.gemini ?? ROADMAP_GEMINI_LIVE) && view.hasKey, drafted.run);
  return (
    <div className="rm-ref rm-o5" data-open={open ? "1" : undefined}>
      <button type="button" className="rm-ref-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <b>How this is worked out</b>
        <span>capacity · realism · drafting · measuring</span>
        <Icon name="chev" />
      </button>
      <div className="rm-ref-b">
        <div>
          <SectionHeader title="Your capacity" aside="what the app has seen" />
          <ThroughputPanel throughput={view.throughput} hoursPerWeek={header.hoursPerWeek} />
        </div>
        <div>
          <SectionHeader
            title="Is this realistic?"
            aside={
              <button type="button" className="rm-hit rm-ilink" onClick={() => setWorked(true)}>
                Constants
              </button>
            }
          />
          <section className="card">
            {cur && current ? (
              <ChecksPanel
                roadmapId={header.id}
                mf={cur}
                aimCheck={f?.aimCheck ?? header.aimCheck}
                intensity={header.intensity}
                dueDay={current.milestone.dueDay}
                m={f?.m ?? 1}
                today={view.today}
                title={`Milestone ${current.milestone.ord}`}
                throughput={view.throughput}
                hoursPerWeek={header.hoursPerWeek}
                intakeEditable={false}
                asOf={asOf}
              />
            ) : (
              <p className="rm-ms-sec t-meta" style={{ borderTop: 0 }}>
                The checks show here once a milestone is current.
              </p>
            )}
            {view.dateCheck && (
              <DateBlock
                roadmapId={header.status === "ACTIVE" ? header.id : null}
                check={view.dateCheck}
                depth={header.depth ?? null}
                rows={view.milestones.filter((r) => !r.held && r.state !== "LATER" && r.state !== "DROPPED")}
                mode="plan"
                userDay={header.targetDay}
                today={view.today}
                throughput={view.throughput}
                feasibility={view.feasibility}
                exam={view.depth?.exam ?? null}
                seenKey={seenBaseOf(seenBasesOfRoadmap(view), "plan")}
              />
            )}
            {others.length > 0 && (
              <div className="rm-ms-sec">
                <div className="t-eyebrow">Other milestones · as accepted</div>
                <ul className="rm-oi-list" style={{ marginTop: 6 }}>
                  {others.map((x, i) => (
                    <li key={`${x.lineageId}:${i}`} className="rm-oi">
                      <div className="rm-vds">
                        <span className="t-meta" style={{ minWidth: 16 }}>
                          {x.ord}
                        </span>
                        {x.knowledge.map((k) => (
                          <VerdictChip key={k.measureKey} verdict={k.verdict} />
                        ))}
                        <VerdictChip verdict={x.time.verdict} unverified={x.time.unverified} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="rm-cap" style={{ marginTop: 6 }}>
                  {TIME_FIXED_LINE}
                </p>
              </div>
            )}
          </section>
        </div>
        <div>
          <SectionHeader title="How this was drafted" />
          {/* The run behind the accepted plan (acceptedRun); the latest run only as "Latest run", never "Drafted by". */}
          {drafted.run && (
            <p className="t-meta" style={{ margin: "0 4px 8px" }}>
              <RunFacts run={drafted.run} today={view.today} label={drafted.label} />
            </p>
          )}
          {drafted.run && <RunTable run={drafted.run} today={view.today} label={drafted.label} />}
          <section className="card rm-tp" style={{ marginTop: 8 }}>
            <div>
              <span className="rm-tp-k">Plan history</span>
              <span className="rm-tp-v">v{header.version}</span>
              <PlanHistory rows={view.history} today={view.today} />
            </div>
          </section>
        </div>
        <section className="card rm-note">
          <RoadmapGlyph name="info" />
          <span>
            <b>How this is measured</b> Cards your reviews bring to a level are tested; cards you add are counted by the app; practice sessions and steps are your own ticks.
            Proficiency, the Aim rank and week quests are worked out from those rows. No model judges progress.{" "}
            <button type="button" className="rm-ilink" onClick={() => setMeasured(true)}>
              Open
            </button>
          </span>
        </section>
      </div>
      <HowMeasuredSheet open={measured} onClose={() => setMeasured(false)} gemini={gemini} />
      <WorkedOutSheet open={worked} onClose={() => setWorked(false)} m={f?.m ?? 1} />
    </div>
  );
}

// ── Aftercare and footer ────────────────────────────────────────────────────

function Aftercare({ view }: { view: RoadmapView }) {
  const [kept, setKept] = useState<Set<string>>(new Set());
  const { run, pending, error, runtime } = useRoadmapAction();
  const rows = view.aftercare.filter((r) => !kept.has(r.templateId));
  // "Keep on Today" is stored (StartSnapshot.aftercareKept through R4's keepOnToday), so the row stops asking.
  // The id names the roadmap (the server finds the milestone holding the practice); the row's own when known.
  const keep = (r: (typeof rows)[number]) => {
    const hide = () => setKept((s) => new Set([...s, r.templateId]));
    const milestoneId = aftercareMilestoneIdOf(r, view.milestones) ?? view.milestones[0]?.id ?? null;
    if (!milestoneId) return hide();
    run((a) => a.keepOnToday(milestoneId, r.templateId), hide);
  };
  if (rows.length === 0) return null;
  const ords = Array.from(new Set(rows.map((r) => r.milestoneOrd))).sort((a, b) => a - b);
  return (
    <div className="rm-o6">
      <SectionHeader title={`Still on Today from milestone${ords.length > 1 ? "s" : ""} ${ords.join(", ")}`} />
      <section className="card pad">
        {rows.map((r) => (
          <div key={r.templateId} className="rm-dr">
            <Icon name="today" />
            <div>
              <b>{r.title}</b>
              <div className="t-meta">on Today · from milestone {r.milestoneOrd}</div>
              <div className="rm-dr-acts">
                <ChipButton disabled={pending} onClick={() => keep(r)}>
                  Keep on Today
                </ChipButton>
                <ChipButton
                  disabled={pending}
                  onClick={() =>
                    run(
                      (a) => a.archiveTask(r.templateId),
                      () =>
                        pushToast({
                          title: "Archived",
                          body: `${r.title} left Today.`,
                          action: { label: "Undo", onAction: () => void runtime.actions.unarchiveTask(r.templateId).then(() => runtime.refresh()) },
                        })
                    )
                  }
                >
                  Archive
                </ChipButton>
              </div>
            </div>
          </div>
        ))}
        <p className="t-meta">Nothing is archived silently: each waits for your choice.</p>
        {error && <ActionError>{error}</ActionError>}
      </section>
    </div>
  );
}

function Footer({ view, current, onReplan, topics = false, gemini = false }: { view: RoadmapView; current: CurrentMilestoneView | null; onReplan: () => void; topics?: boolean; gemini?: boolean }) {
  const [archive, setArchive] = useState(false);
  const [done, setDone] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);
  const header = view.header!;
  // DONE or ARCHIVED (a reset's archive included): no dead end — the next aim, and the history kept.
  if (header.status === "DONE" || header.status === "ARCHIVED")
    return (
      <div className="rm-o7 rm-closed" id="archive" data-wc-block="roadmap-footer">
        <span className="rm-closed-r">
          <Button variant="primary" href={ROADMAP_NEW_HREF}>
            {AIM_NEW_AIM}
          </Button>
          <InfoTip topic="this roadmap's history">{AIM_HISTORY_LINE}</InfoTip>
        </span>
      </div>
    );
  if (header.status !== "ACTIVE") return null;
  const reached = Boolean(header.reachedDay);
  return (
    <div className="rm-o7 rm-acts" id="archive" style={{ marginTop: 0 }} data-wc-block="roadmap-footer">
      {reached && (
        <Button variant="primary" onClick={() => setDone(true)}>
          Mark the aim done
        </Button>
      )}
      <Button onClick={onReplan}>Re-plan</Button>
      {/* Revision 5, lane 9: [Break into topics] joins a LEVELS plan's actions only while TOPIC_PLANS_LIVE (row 6's budget holds) */}
      {topics && header.planKind !== "TOPICS" && !view.draft && (
        <>
          <Button onClick={() => setBreakOpen(true)}>{BREAK_INTO_TOPICS_WORD}</Button>
          <BreakIntoTopicsSheet open={breakOpen} onClose={() => setBreakOpen(false)} roadmapId={header.id} gemini={gemini} />
        </>
      )}
      <Button variant="danger" onClick={() => setArchive(true)}>
        Archive
      </Button>
      {!reached && (
        <Button variant="quiet" onClick={() => setDone(true)}>
          Mark done
        </Button>
      )}
      <ArchiveSheet open={archive} onClose={() => setArchive(false)} roadmapId={header.id} openGoal={Boolean(current?.goalId)} />
      <MarkDoneSheet open={done} onClose={() => setDone(false)} roadmapId={header.id} reached={reached} />
    </div>
  );
}

// ── ACTIVE / DONE / ARCHIVED ────────────────────────────────────────────────

/** The list's line on a plan aimed at a depth: the Paragon conditions (naming the count of required Domains), or what keeps Paragon closed. */
export function depthListLine(view: Pick<RoadmapView, "depth" | "paragonMissing" | "rank">): string | null {
  if (!view.depth) return null;
  const missing = view.paragonMissing ?? [];
  if (missing.length === 0) return paragonDepthLine(view.depth.coverage.length);
  return view.rank ? topRankDepthLine(view.rank.top, missing) : null;
}

function LivingRoadmap({ view, startPreview, gates }: { view: RoadmapView; startPreview?: StartPreview | null; gates?: LiveGates }) {
  const header = view.header!;
  const current = view.current as CurrentMilestoneView | null;
  const [replan, setReplan] = useState(false);
  const [start, setStart] = useState(Boolean(startPreview));
  const index = useMemo(() => domainIndexOf(view), [view]);
  const scope = useMemo(() => editorScopeOf(view, current ? [current.milestone] : []), [view, current]);
  const names = useMemo(() => new Map([...index.values()].map((d) => [d.id, d.name] as const)), [index]);
  const scheduled = positionsOf(view);
  const closed = header.status !== "ACTIVE";
  // Constraint safety (contracts §19): the activity card asks above Now; once answered it sits before the footer, editable.
  const asks = activityAsksOf(view.activityConfirm);
  // UI motion: the seen bases (D8), the horizon band, and the user's own Start (it pings the current node once: `start`, ACT).
  const seen = useMemo(() => seenBasesOfRoadmap(view), [view]);
  const horizon = useMemo(() => horizonOfRoadmap(view), [view]);
  const goalId = current?.goalId ?? null;
  const [startSeen, setStartSeen] = useState<{ goalId: string | null; tick: number }>({ goalId, tick: 0 });
  if (startSeen.goalId !== goalId) setStartSeen({ goalId, tick: !startSeen.goalId && goalId ? startSeen.tick + 1 : startSeen.tick });
  const body = (
    <div className="rm-cols" data-wc-block={closed ? "roadmap-done" : undefined}>
      <div className="rm-col">
        <AimHeader
          className="rm-o1"
          header={header}
          rank={view.rank}
          proficiency={view.proficiency}
          today={view.today}
          scheduled={scheduled}
          writesOff={view.writesOff}
          depth={view.depth ?? null}
          dateCheck={view.dateCheck ?? null}
          milestones={view.milestones}
          paragonMissing={view.paragonMissing ?? []}
          m={view.feasibility?.m ?? 1}
          names={names}
          horizon={horizon}
          writesOffChip
        />
        {!closed && <Triggers view={view} current={current} onReplan={() => setReplan(true)} />}
        {!closed && asks && (
          <div className="rm-o2">
            <ActivityConfirmCard view={view.activityConfirm} roadmapId={header.id} today={view.today} place="plan" onReplan={() => setReplan(true)} />
          </div>
        )}
        {!closed && view.draft && (
          <div className="rm-o2" id="replan">
            <DraftReview view={view} mode="replan" gates={gates} />
          </div>
        )}
        {!closed && current && <NowSection view={view} current={current} onStartOpen={() => setStart(true)} seen={seen} />}
        {view.topicMap && topicPlansOn(gates) && (
          <div className="rm-o4">
            <TopicMap map={view.topicMap} mode="plan" gates={gates} seenBasis={seen?.plan ?? null} today={view.today} />
          </div>
        )}
        {view.milestones.length > 0 && (
          <MilestonesList
            rows={view.milestones}
            today={view.today}
            targetDay={header.targetDay}
            open={!closed}
            positions={scheduled}
            paragon={paragonLineShown(view.rank)}
            depthLine={depthListLine(view)}
            seen={seen}
            startTick={startSeen.tick}
            chain={topicChainOf(view, topicPlansOn(gates))}
          />
        )}
        {!closed && <GapPanel gaps={view.gaps} hidden={view.gapsHidden} scope={scope} gates={gates} />}
        {!closed && !asks && (
          <div className="rm-o6">
            <ActivityConfirmCard view={view.activityConfirm} roadmapId={header.id} today={view.today} place="plan" onReplan={() => setReplan(true)} />
          </div>
        )}
        <Footer view={view} current={current} onReplan={() => setReplan(true)} topics={topicPlansOn(gates)} gemini={topicGeminiOn(view, gates)} />
      </div>
      <div className="rm-col">
        {view.toward && (
          <div className="rm-o3" data-wc-block="toward">
            <SectionHeader title="Toward the aim" aside={header.firstAcceptedDay ? `since you began · ${dayLabel(header.firstAcceptedDay, view.today)}` : undefined} />
            <TowardAim
              toward={view.toward}
              rows={view.milestones}
              aim={header.aim}
              cardsArea={header.area.kind === "FIELD"}
              m={view.feasibility?.m ?? 1}
              today={view.today}
              firstAcceptedDay={header.firstAcceptedDay}
              domainIndex={index}
              writesOff={view.writesOff}
              seen={seenBaseOf(seen, "plan")}
            />
          </div>
        )}
        {!closed && <Reference view={view} current={current} gates={gates} />}
        {view.aftercare.length > 0 && <Aftercare view={view} />}
      </div>
    </div>
  );
  return (
    <>
      {scope ? <ItemEditor scope={scope}>{body}</ItemEditor> : body}
      {!closed && <ReplanSheet open={replan} onClose={() => setReplan(false)} roadmapId={header.id} startedOrd={current?.goalId ? current.milestone.ord : null} />}
      {!closed && current && scope && (
        <ItemEditor scope={scope}>
          <StartSheet open={start} onClose={() => setStart(false)} milestone={current.milestone} today={view.today} initial={startPreview ?? null} activityConfirm={view.activityConfirm} roadmapId={header.id} heldRank={view.rank?.index ?? null} />
        </ItemEditor>
      )}
    </>
  );
}

// ── A plan made before revision 4 (F-R4-16) ──────────────────────────────────

/**
 * A legacy roadmap shows no milestone or item text, whatever its status: its
 * aim (the user's words), its Area, the banner and its one action, and its
 * history. A legacy DRAFT: "[Draft it again]" opens the intake form; saving
 * sets a depth and the next draft replaces the old rows. A legacy ACTIVE plan:
 * "[Start again at a depth]" carries its aim, Area and Domains into a new
 * intake (a sessionStorage handoff, never a URL), and saving it archives this
 * roadmap in the same transaction. It isn't measured, and nothing starts.
 */
function LegacyRoadmap({ view }: { view: RoadmapView }) {
  const header = view.header!;
  const runtime = useRoadmapRuntime();
  const legacy = view.legacy ?? view.draft?.legacy ?? null;
  const status = legacy?.kind ?? header.status;
  const draft = status === "DRAFT";
  const closed = status === "DONE" || status === "ARCHIVED";
  // Its aim, Area and Domains travel (F-R4-16): the plan's own Domains (LegacyView or the header), never the Area's defaults.
  const handoff = restartHandoffOf({ aim: header.aim, roadmapId: header.id, area: header.area, track: header.track, domainIds: legacy?.domainIds ?? header.domainIds ?? null, areaFieldId: legacy?.areaFieldId });
  const restart = () => {
    if (runtime.fixture) return;
    writeAimHandoff(handoff);
  };
  return (
    <div className="rm-stack" data-wc-block="roadmap-legacy">
      <section className="card rm-aim" aria-label="Aim">
        <div className="t-eyebrow">{header.status === "ARCHIVED" ? "Aim · archived" : header.status === "DONE" ? "Aim · done" : "Aim"}</div>
        <p className="rm-aim-t" data-wc="own">
          {header.aim}
        </p>
        <Chips className="rm-aim-chips">
          {spaced([
            <AreaChipShort key="area" header={header} />,
            <Chip key="day">{dayLabel(header.targetDay, view.today)}</Chip>,
            <HonestyChip
              key="legacy"
              kind="legacy"
              label={SHORT_LEGACY}
              full={
                <>
                  <b>{draft ? LEGACY_DRAFT_BANNER : LEGACY_ACTIVE_BANNER}</b>
                  {!draft && !closed && <> {LEGACY_MEASURE_LINE}</>}
                </>
              }
            />,
          ])}
        </Chips>
      </section>
      <section className="card rm-banner" aria-label="Planned before plans aimed at a depth">
        {legacy?.geminiHidden && (
          <p className="rm-banner-t" data-wc="honest">
            {LEGACY_GEMINI_HIDDEN}
          </p>
        )}
        {draft ? (
          <Button variant="primary" href={ROADMAP_NEW_HREF}>
            {DRAFT_IT_AGAIN_WORD}
          </Button>
        ) : !closed ? (
          <Button variant="primary" href={ROADMAP_NEW_HREF} onClick={restart}>
            {START_AGAIN_AT_DEPTH_WORD}
          </Button>
        ) : null}
      </section>
      {view.history.length > 0 && (
        <section className="card rm-tp">
          <div>
            <span className="rm-tp-k">Plan history</span>
            <span className="rm-tp-v">v{header.version}</span>
            <PlanHistory rows={view.history} today={view.today} />
          </div>
        </section>
      )}
      {closed && (
        <div className="rm-closed">
          <span className="rm-closed-r">
            <Button variant="primary" href={ROADMAP_NEW_HREF}>
              {AIM_NEW_AIM}
            </Button>
            <InfoTip topic="this roadmap's history">{AIM_HISTORY_LINE}</InfoTip>
          </span>
        </div>
      )}
    </div>
  );
}

/** A view of a plan made before revision 4 (the server marks it; its milestone and item text never arrives). */
export function isLegacyView(view: Pick<RoadmapView, "legacy" | "header" | "draft">): boolean {
  return Boolean(view.legacy || view.header?.legacy || view.draft?.legacy);
}

/** The screen for one RoadmapView (the page and the fixtures render it). */
export function RoadmapScreen({
  view,
  startPreview,
  gates,
}: {
  view: RoadmapView;
  /** Fixtures: a Start sheet already computed (it opens with it). */
  startPreview?: StartPreview | null;
  /** Fixtures only: draw a lead-only state (Gemini live, area suggestions live). The live page passes nothing: the switches decide. */
  gates?: LiveGates;
}) {
  // The living page carries it as the header's «writes off» chip (ui-motion.md §3.3 screen 4); the other screens keep the banner.
  const living = !(view.state === "NONE" || !view.header) && !isLegacyView(view) && !(view.state === "RUNNING" && view.run) && !(view.state === "DRAFT" && view.draft);
  const writesOffNote = view.writesOff && !living ? (
    <section className="card rm-note" style={{ marginBottom: 16 }}>
      <RoadmapGlyph name="info" />
      <span>{WRITES_OFF_BANNER}</span>
    </section>
  ) : null;
  let screen: ReactNode = null;
  if (view.state === "NONE" || !view.header) screen = <EmptyRoadmap hasKey={view.hasKey} gates={gates} />;
  else if (isLegacyView(view)) screen = <LegacyRoadmap view={view} />;
  else if (view.state === "RUNNING" && view.run) screen = <DraftRunning view={view} />;
  else if (view.state === "DRAFT" && view.draft) screen = <DraftReview view={view} gates={gates} />;
  else screen = <LivingRoadmap view={view} startPreview={startPreview} gates={gates} />;
  return (
    <>
      <GoalSwitcher goals={view.goals} />
      {writesOffNote}
      {screen}
    </>
  );
}

// ── Revision 5, lane 9: [Break into topics] (contracts §22.14 breakIntoTopicsCore; ruling 49) ──

/**
 * A TOPICS re-plan draft of this LEVELS plan (version + 1); the plan stays live until the map is accepted. With the
 * topic map's Gemini chain on (ruling N11, `gemini`), one tap is [Break it down] itself: breakDownCore writes the draft
 * and claims RATE, and the page's chain poll takes it from there; else the app's own map (breakIntoTopicsCore).
 */
function BreakIntoTopicsSheet({ open, onClose, roadmapId, gemini = false }: { open: boolean; onClose: () => void; roadmapId: string; gemini?: boolean }) {
  const { run, pending, error } = useRoadmapAction();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={BREAK_INTO_TOPICS_WORD}
      footer={
        <Button variant="primary" block disabled={pending} onClick={() => run((a): Promise<RoadmapActionResult<unknown>> => (gemini ? a.breakDown(roadmapId) : a.breakIntoTopics(roadmapId)), () => onClose())}>
          {BREAK_INTO_TOPICS_WORD}
        </Button>
      }
    >
      <p className="t-meta" style={{ margin: 0 }}>
        {gemini ? BREAK_INTO_TOPICS_GEMINI_LINE : BREAK_INTO_TOPICS_LINE}
      </p>
      {error && <ActionError>{error}</ActionError>}
    </Sheet>
  );
}

/** Revision 5, lane 9: a TOPICS plan's chain heading (the estimate, and the depth tail "+1 to reach Fluent"); null on LEVELS or with the switch off. */
export function topicChainOf(view: Pick<RoadmapView, "header">, on: boolean): { rating: RatingView; tail: string | null; roadmapId: string } | null {
  const h = view.header;
  if (!on || !h || h.planKind !== "TOPICS" || !h.rating) return null;
  const stage = h.depth ? topicStageOfLevel(h.depth) : null;
  return { rating: h.rating, tail: h.rating.tail > 0 && stage ? tailToReachLine(h.rating.tail, TOPIC_STAGE_NAMES[stage]) : null, roadmapId: h.id };
}
