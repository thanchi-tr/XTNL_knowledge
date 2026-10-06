"use client";

/**
 * The Start sheet (F15; final-roadmap.html G; ui-motion.md screen 7, §3.3 and
 * §7.7), computed by code before anything is created (loadStartPreview →
 * startPreview → refitForStart). Fewer words, the same facts: every sentence
 * the sheet used to print is still in the DOM, one tap away.
 *
 *   Target        [Use 42] [Keep 46 — Over] (the Over switch, stored); the
 *                 check's reason is in the sheet's Key. With no re-fit: "Target
 *                 still fits".
 *   Time          CapacityGauge "need ≈ 3 h 20 · have ≈ 4 h 30 /wk" and its
 *                 verdict chip ("Unverified · Fits" while capacity calibrates);
 *                 the time sentence and TIME_FIXED_LINE in the Key.
 *   n to decide   this milestone's PENDING items, in the row grammar (ItemRow).
 *   Goes to Today the goal title, each practice, each step, the checkpoint
 *                 label and the milestone's Domains: KindGlyph · label ·
 *                 provenance (ProvMark, or the Gemini chip with its who-word).
 *                 A row that still needs the user shows [m.lock] and its acts
 *                 ([I checked this] [Edit] / [Map to…]); "I checked this" opens
 *                 the lock (unlock, ACT). Each row's why is in the section's (i).
 *                 Start is offered only when every row is YOURS or WORKED_OUT.
 *   Practices     each a Switch, on by default (off when the same name is
 *                 already on Today from an earlier milestone). Each name, and
 *                 each step below, is looked up in the milestone's items:
 *                 Gemini's words keep their chip and struck numbers here too
 *                 (the contract §11.3). Rule, minutes and the XP price are a
 *                 compact figure with its spoken twin (D26).
 *   Pay           "pays [c-mp] 6 × progress «from 70%»" and its floor tick,
 *                 recomputed on every practice switch with the arithmetic
 *                 finishStartCore freezes (startPayOf); the figure crossfades
 *                 when the user's own switch changes it (pay-swap, ACT: a stated
 *                 rate is not money earned, so no roll). A zero reads «pays
 *                 nothing» (its reason one tap away). The due day, "once 21 days
 *                 old" and the Mid-goal limit line are in the Key.
 *   Rank          "gives Aim rank [rank.N active] X" (never the done shape: a
 *                 rank not yet held keeps its verb), or "keeps your rank".
 *   Week quests   "[quest.bring]2 [quest.add]3 [quest.practice]3 «pays nothing»":
 *                 the generator's set for the rest of this life week; each
 *                 quest's words and "fixed for the week once you start" are in
 *                 the Key.
 *
 * Revision 4 (F-R4-13): when the stated pay rests on a practice the app added
 * (without it the milestone would fall under the practice gate) the sheet
 * says so: «rests on an added practice», whose panel holds restsOnAddedLine
 * ("… because of the practice the app added (Explain it in your own words).
 * Switch it off and this milestone pays nothing."). A body milestone's sheet
 * carries HEALTH_LINE: one «Not medical advice · ask a professional» chip
 * (D12), dropped when a row's HEALTH flag already shows the line.
 *
 * Constraint safety (contracts §19): while the plan waits on the user's
 * answer about activities the sheet says so and jumps to the page's own card
 * ("Waiting on your answer about activities →"): the card isn't duplicated
 * here. The milestone's practices waiting on the answer, and those the user
 * said to avoid (a suggestion from their words never holds one back), show
 * their line in place of their switch ("not added to Today"): they count as
 * off in the pay line and in what Start sends, so nothing the gate holds
 * reaches Today. A held step or checkpoint (no switch) keeps its line.
 *
 * Start is hidden (not disabled) while ROADMAP_GOALS_LIVE is false. The sticky
 * button is never dead: until Start can be offered it jumps to the next row to
 * check, with "2 rows left" and the gate's sentence in its (i).
 *
 * UI motion (ui-motion.md §5.2): only ACT motions, through glyph-motion's
 * playGlyph (unlock, pay-swap); InfoTips and chips open with tip-open, the
 * health chip instantly (D11). No shader: data-fx="none". Three InfoTips at
 * most (the Key, the rows' why, the gate; D13). The sheet's own body carries
 * data-wc-block="start-sheet" for the §3.2 row-7 budgets; StartSheetBody
 * renders it without the portalled Sheet, so roadmap-ui-check counts it.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { ChipButton } from "@/components/ui/Chip";
import { Switch } from "@/components/ui/Tabs";
import { pushToast } from "@/components/ui/toast-store";
import { ActionError } from "@/components/home/ActionError";
import { Glyph, KIND_GLYPH, KIND_WORDS, KindGlyph, Mark, PROVMARK_GLYPH, PROVMARK_WORDS, ProvMark, type GlyphName, type ProvMarkClass, type QuestKind } from "@/components/glyph/Glyph";
import { Chips, HonestyChip, VerdictChip } from "@/components/glyph/HonestyChip";
import { CardKey, InfoTip, type KeyEntry } from "@/components/glyph/InfoTip";
import { CapacityGauge, type GaugeFigure } from "@/components/glyph/CapacityGauge";
import { GLYPH_MEANS } from "@/components/glyph/paths/means";
import type { TrackSigil } from "@/components/glyph/paths";
import { playGlyph } from "@/lib/glyph-motion";
import { payBar } from "@/lib/life-economy";
import {
  AIM_RANKS,
  WEEK_QUEST_EVIDENCE_OF,
  provenanceOf,
  type ActivityConfirmView,
  type Decision,
  type MilestoneDraft,
  type Origin,
  type StartChoices,
  type StartPracticeRow,
  type StartPreview,
  type TimeCheck,
  type TodayBoundRow,
  type WeekQuestSet,
} from "@/lib/roadmap-types";
import {
  ACTIVITY_HELD_LEFT_OUT,
  ACTIVITY_HELD_WAITING,
  CHECKPOINT_KIND_WORD,
  HEALTH_LINE,
  PROVENANCE_WORDS,
  SHORT_GEMINI,
  SHORT_GEMINI_KEPT,
  SHORT_GIVES_RANK,
  SHORT_HAVE,
  SHORT_HEALTH,
  SHORT_KEEPS_RANK,
  SHORT_NEED,
  SHORT_OVER,
  SHORT_PAYS_NOTHING,
  SHORT_RESTS_ON_ADDED,
  SHORT_SECTION,
  SHORT_WAITING_ACTIVITIES,
  SHORT_WEEK_QUESTS,
  SHORT_YOURS,
  TIME_FIXED_LINE,
  TRACK_SIGIL,
  WEEK_QUEST_CAPTIONS,
  activityLeftOutLine,
  activityWaitingLine,
  dayWithWeekday,
  hoursLabel,
  labelWithClass,
  plural,
  restsOnAddedLine,
  ruleWords,
  shortRowsLeft,
  shortToDecide,
  spanLabel,
  statedLine,
  windowLabel,
} from "./roadmap-copy";
import { activityAsksOf, canMapOf, capacityFlagsOf, editorRowOf, heldPracticesOf, rowDomId, stageGlyphOf, startPayOf, titleItemOf, type EditorRow, type ItemAction } from "./roadmap-ui-model";
import { ACTIVITY_DOM_ID, ActivityConfirmCard } from "./ActivityConfirm";
import { useRoadmapAction, useRoadmapRuntime } from "./roadmap-runtime";
import { useItemEditor, type ActTarget } from "./ItemEditor";
import { ItemRow, MarkedLabel, libraryMarksOf, useDisplayLabel } from "./ItemRow";
import { PaysLine } from "./PaysLine";
import { timeSentence } from "./ChecksPanel";
import { TitleClassChip } from "./ProvenanceChip";
import { FlagChips, FlagReasons } from "./FlagChips";

const TODAY_KIND_WORD: Readonly<Record<TodayBoundRow["kind"], string>> = {
  TITLE: "Mid goal",
  PRACTICE: "Practice",
  STEP: "Step",
  CHECKPOINT: "Checkpoint",
  DOMAIN: "Domain",
};

const NEEDS: Readonly<Record<TodayBoundRow["needs"], { why: string | null; actions: ItemAction[] }>> = {
  NONE: { why: null, actions: [] },
  CHECK_OR_EDIT: { why: "Gemini's words — goes to Today as written.", actions: ["CHECK", "EDIT"] },
  CHECK_OR_MAP: { why: "Gemini picked this Domain — it sets what counts.", actions: ["CHECK", "MAP"] },
  NAME_IT: { why: "Name this practice.", actions: ["EDIT"] },
};

// ─── The sheet's own short words (screen 7; app words, counted by §3.1) ───

/** The today-check row's label. */
export const START_TARGET_WORD = "Target";
/** The today-check row when the accepted target still fits (its sentence is in the Key). */
export const START_TARGET_FITS = "still fits";
/** Its full sentence (the Key). */
export const START_TARGET_FITS_LINE = "The target fitted when you accepted still fits today's cards and pace.";
/** The Today-bound rows' head (the rows' why lines are in its (i)). */
export const START_TODAY_HEAD = "Goes to Today";
/** The practices' head. */
export const START_PRACTICES_HEAD = "Practices";
/** A practice held by the activity answers, in place of its switch (ACTIVITY_HELD_WAITING stays sr-only and in the Key). */
export const START_NOT_ADDED = "Not added to Today";
/** The gate's sentence, verbatim (its (i) beside "2 rows left"). */
export function startGateLine(left: number): string {
  return `Start is offered when every row going to Today is yours or written by the app · ${plural(left, "row")} left.`;
}

/** "2 cards", "3 sessions": a preview count, with its unit. */
function previewCount(q: WeekQuestSet["quests"][number]): string {
  if (q.kind === "CHECKPOINT") return "log a score";
  const words: Record<string, [string, string]> = { card: ["card", "cards"], session: ["session", "sessions"], day: ["day", "days"], step: ["step", "steps"], log: ["score", "scores"] };
  const [one, many] = words[q.unit] ?? ["", ""];
  return `${q.count} ${q.count === 1 ? one : many}`;
}

/** The practice the stated pay rests on, when the app added it (R4's StartPreview.pay.restsOnAdded; the contract §15.11). */
export function restsOnAddedOf(p: Pick<StartPreview, "pay">): string | null {
  const name = p.pay.restsOnAdded;
  return typeof name === "string" && name.trim().length > 0 ? name : null;
}

/** The Today-bound rows' remaining count (Start waits on these). */
export function rowsToCheck(p: Pick<StartPreview, "todayRows">): TodayBoundRow[] {
  return p.todayRows.filter((r) => r.needs !== "NONE");
}

/**
 * What a Today-bound row offers: a NUMBER row (Gemini wrote a number, an item
 * or the title) offers only Edit — never "I checked this", which would put
 * Gemini's number on Today as the goal's words; Map to… only with the user's
 * Domains on the page.
 */
export function todayRowActionsOf(needs: TodayBoundRow["needs"], flags: readonly string[], canMap: boolean): ItemAction[] {
  let out = [...NEEDS[needs].actions];
  if (flags.includes("NUMBER")) out = out.filter((a) => a !== "CHECK");
  if (!canMap) out = out.filter((a) => a !== "MAP");
  return out;
}

/**
 * A row's provenance as the glyph layer draws it (the same rule as
 * ProvenanceChip): Gemini's words keep a chip with the who-word (D25); the
 * user's, the syllabus's and the app's words are a glyph-only ProvMark whose
 * exact words are sr-only (and in the sheet's Key, D13).
 */
export function startProvOf(origin: Origin, decision: Decision): { chip: "gemini" | "gemini-kept"; words: string } | { mark: ProvMarkClass; words: string } {
  const cls = provenanceOf(origin, decision);
  if (cls === "DRAFT") return { chip: "gemini", words: PROVENANCE_WORDS.DRAFT };
  if (cls === "KEPT_SUGGESTION") return { chip: "gemini-kept", words: PROVENANCE_WORDS.KEPT_SUGGESTION };
  const mark: ProvMarkClass = cls === "WORKED_OUT" ? "app-written" : origin === "SYLLABUS" && decision !== "EDITED" ? "syllabus" : decision === "CHECKED" ? "checked" : "you";
  return { mark, words: PROVMARK_WORDS[mark] };
}

/** A practice's rule as a compact figure ("3/wk"); ruleWords' words are its spoken twin (D26). */
export function ruleShort(rule: string | null): string {
  const t = (rule ?? "").trim().toUpperCase();
  const target = /^TARGET:(\d+)\/(W|M)$/.exec(t);
  if (target) return `${target[1]}/${target[2] === "W" ? "wk" : "mo"}`;
  const every = /^EVERY:(\d+)$/.exec(t);
  if (every) return `every ${every[1]} d`;
  return ruleWords(rule);
}

/** A practice row's figures in words: "3× a week, 45 minutes, about 14.0 XP a session". */
export function practiceMetaSpeech(pr: Pick<StartPracticeRow, "rule" | "minutes" | "price">): string {
  return `${ruleWords(pr.rule)}, ${pr.minutes} minutes${pr.price != null ? `, about ${pr.price.toFixed(1)} XP a session` : ""}`;
}

/** The CapacityGauge's two figures from the time check's worst week; null when there is none or your time is still calibrating. */
export function startCapacityOf(t: Pick<TimeCheck, "worstWeek">): { need: GaugeFigure; have: GaugeFigure; yours: boolean } | null {
  const w = t.worstWeek;
  if (!w || w.availableMin == null) return null;
  const load = w.reviewMin + w.writeMin + w.practiceMin;
  return { need: { value: load, text: hoursLabel(load, false) }, have: { value: w.availableMin, text: hoursLabel(w.availableMin, false) }, yours: w.availableClass === "YOURS" };
}

const WQ_KIND: Readonly<Record<WeekQuestSet["quests"][number]["kind"], QuestKind>> = { RAISE: "raise", ADD: "add", PRACTICE: "practice", STEP: "step", CHECKPOINT: "checkpoint" };

function questEvidenceWords(q: WeekQuestSet["quests"][number]): string {
  return q.kind === "CHECKPOINT" ? WEEK_QUEST_CAPTIONS.CHECKPOINT : WEEK_QUEST_EVIDENCE_OF[q.kind] === "TESTED" ? PROVENANCE_WORDS.MEASURED : WEEK_QUEST_CAPTIONS[q.kind];
}

/** Each week quest in words, as the sheet listed them ("Bring 2 cards … · 2 cards · tested by your reviews"). */
export function weekQuestLines(set: WeekQuestSet): string[] {
  return set.quests.map((q) => `${q.label} · ${previewCount(q)} · ${questEvidenceWords(q)}`);
}

/** The preview's footer, verbatim. */
export function weekQuestFooter(set: WeekQuestSet, today: string): string {
  if (set.quests.length === 0) return `No week quests this week: ${set.basis[0] ?? "nothing is asked of it"}.`;
  return `${windowLabel(set.quests[0].from, set.quests[0].to, today)} · fixed for the week once you start. Worked out from your cards and the plan; they pay nothing.`;
}

/** The pay paragraph the sheet used to print, verbatim (now in its Key, with the glyph). */
function payParagraph(p: StartPreview, pay: { stated: number; zeroReason: StartPreview["pay"]["zeroReason"]; paidOn: string | null }, today: string): ReactNode {
  return (
    <>
      Becomes a Mid goal on Today, due {dayWithWeekday(p.dueDay, today)} · <PaysLine text={statedLine(pay.stated, pay.zeroReason, pay.paidOn, today)} />
      {pay.stated > 0 ? ", once 21 days old" : ""} · progress from your records, no +1
    </>
  );
}

/** The sheet's description: the milestone's dates, with their spoken twin. */
export function StartSheetDates({ milestone, today }: { milestone: Pick<MilestoneDraft, "windowStart" | "dueDay">; today: string }) {
  const { windowStart: from, dueDay: to } = milestone;
  if (!from || !to) return <>{spanLabel(from, to, today)}</>;
  return (
    <span className="rm-ss-dates">
      <Glyph name="t.cal" size={14} inherit />
      <span aria-hidden="true">{spanLabel(from, to, today)}</span>
      <span className="sr-only">{`${dayWithWeekday(from, today)} to ${dayWithWeekday(to, today)}`}</span>
    </span>
  );
}

/** [m.lock] beside a row that still needs the user (its only meaning, D5); the user's "I checked this" opens it (unlock, ACT). */
function CheckLock({ open }: { open: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const was = useRef(open);
  useEffect(() => {
    // ACT: only the user's own tap opens it here (it mounts closed)
    if (open && !was.current) void playGlyph(ref.current, "unlock", { licence: "ACT" });
    was.current = open;
  }, [open]);
  return <Glyph ref={ref} name="m.lock" open={open} size={16} inherit className="rm-ss-lock" />;
}

/** A Today-bound row's kind: the quest glyph with its evidence badge, a Domain's s-know, the milestone's cairn for its title. */
function TodayKindMark({ row, milestone, track, words }: { row: TodayBoundRow; milestone: MilestoneDraft; track: TrackSigil; words: string }) {
  if (row.kind === "PRACTICE" || row.kind === "STEP" || row.kind === "CHECKPOINT") {
    const k = WQ_KIND[row.kind];
    return <KindGlyph kind={k} track={track} size={20} words={`${words} · ${KIND_WORDS[k]}`} className="rm-ss-g" />;
  }
  const stage = row.kind === "TITLE" ? stageGlyphOf(milestone.stage, null) : null;
  return (
    <span className="rm-ss-g">
      {row.kind === "DOMAIN" ? <Mark glyph="s-know" size={20} /> : <Glyph name={stage?.glyph ?? "route"} gate={stage?.gate ?? undefined} n={stage?.n ?? undefined} size={20} inherit />}
      <span className="sr-only">{words}</span>
    </span>
  );
}

function TodayRowView({ row, milestone, track }: { row: TodayBoundRow; milestone: MilestoneDraft; track: TrackSigil }) {
  const editor = useItemEditor();
  const marks = libraryMarksOf(editor?.scope.library);
  const item = row.itemId ? (milestone.items.find((it) => it.id === row.itemId) ?? null) : null;
  const target: ActTarget = item ? { row: editorRowOf(item), item, milestone } : { row: titleItemOf(milestone), item: null, milestone };
  const actions = todayRowActionsOf(row.needs, target.row.flags, canMapOf(editor?.scope.library));
  const shown = useDisplayLabel(target.row, milestone, editor?.scope, item?.method);
  const kindLabel = row.kind === "CHECKPOINT" && item?.checkpointKind ? `Checkpoint · ${CHECKPOINT_KIND_WORD[item.checkpointKind]}` : TODAY_KIND_WORD[row.kind];
  const prov = startProvOf(item ? item.origin : milestone.titleOrigin, item ? item.decision : milestone.titleDecision);
  const rowId = target.row.id;
  const err = editor?.errorFor(rowId) ?? null;
  // The lock opens on the user's own "I checked this" and closes again if the check fails (state adjusted while rendering, not in an effect).
  const [checking, setChecking] = useState(false);
  const [seenErr, setSeenErr] = useState<string | null>(err);
  if (err !== seenErr) {
    setSeenErr(err);
    if (err) setChecking(false);
  }
  const needs = row.needs !== "NONE";
  return (
    <div id={rowDomId(rowId)} className="rm-it rm-ss-tr" data-needs={needs ? row.needs : undefined}>
      <div className="rm-ss-tr-h">
        <TodayKindMark row={row} milestone={milestone} track={track} words={kindLabel} />
        <p className="rm-it-l" data-wc="name">
          <MarkedLabel label={row.label} struck={row.label === target.row.label ? shown.struck : undefined} marks={marks} />
        </p>
        {"chip" in prov ? <HonestyChip kind={prov.chip} label={prov.chip === "gemini" ? SHORT_GEMINI : SHORT_GEMINI_KEPT} /> : <ProvMark cls={prov.mark} />}
      </div>
      {target.row.flags.length > 0 && (
        <div className="rm-it-chips">
          <FlagChips flags={target.row.flags} />
        </div>
      )}
      <FlagReasons flags={target.row.flags} ctx={{ constraints: editor?.scope.constraints ?? null, milestoneOrd: milestone.ord, milestoneCount: editor?.scope.milestoneCount }} reasons={shown.reasons} />
      {(needs || actions.length > 0) && (
        <div className="rm-acts">
          {needs && <CheckLock open={checking} />}
          {actions.map((a) => (
            <ChipButton
              key={a}
              onClick={() => {
                if (a === "CHECK") setChecking(true);
                editor?.act(target, a);
              }}
            >
              {a === "CHECK" ? "I checked this" : a === "MAP" ? "Map to…" : "Edit"}
            </ChipButton>
          ))}
        </div>
      )}
      {err && <ActionError>{err}</ActionError>}
    </div>
  );
}

/**
 * An item's words echoed on the sheet outside its own row (the Practices
 * switches, the Steps list; the contract §11.3): looked up by its id in the
 * milestone, shown as written with its NUMBER spans struck (the server's, else
 * the device's re-check), and Gemini's words with their chip. A name that no
 * longer matches the item's label is shown plain (nothing to strike against).
 */
export function useEchoedItem(milestone: MilestoneDraft, itemId: string, label: string) {
  const editor = useItemEditor();
  const item = milestone.items.find((it) => it.id === itemId) ?? null;
  const row = useMemo<EditorRow>(
    () =>
      item
        ? editorRowOf(item)
        : { id: itemId, kind: "STEP", label, origin: "USER", decision: "EDITED", flags: [], domainId: null, proposed: false, placeholder: false },
    [item, itemId, label]
  );
  const shown = useDisplayLabel(row, milestone, editor?.scope, item?.method);
  const cls = item ? provenanceOf(item.origin, item.decision) : null;
  return { cls, struck: item && label === item.label ? shown.struck : undefined };
}

function EchoedLabel({ milestone, itemId, label }: { milestone: MilestoneDraft; itemId: string; label: string }) {
  const { cls, struck } = useEchoedItem(milestone, itemId, label);
  const editor = useItemEditor();
  return (
    <>
      <p className="rm-it-l" data-wc="name">
        <MarkedLabel label={label} struck={struck} marks={libraryMarksOf(editor?.scope.library)} />
      </p>
      {(cls === "DRAFT" || cls === "KEPT_SUGGESTION") && (
        <div className="rm-it-chips">
          <TitleClassChip cls={cls} />
        </div>
      )}
    </>
  );
}

function PracticeSwitchRow({ pr, milestone, off, onToggle, held }: { pr: StartPracticeRow; milestone: MilestoneDraft; off: boolean; onToggle: () => void; held?: string | null }) {
  const { cls } = useEchoedItem(milestone, pr.itemId, pr.name);
  const named = labelWithClass(pr.name, cls);
  return (
    <div className={cls === "DRAFT" ? "rm-it rm-it-draft" : cls === "KEPT_SUGGESTION" ? "rm-it rm-it-kept" : "rm-it"}>
      <EchoedLabel milestone={milestone} itemId={pr.itemId} label={pr.name} />
      <div className="rm-it-m">
        <span aria-hidden="true">
          {ruleShort(pr.rule)} · {pr.minutes} min
          {pr.price != null && (
            <>
              {" · ≈ "}
              <Mark glyph="c-xp" size={14} />
              <span className="num">{pr.price.toFixed(1)}</span> a session
            </>
          )}
        </span>
        <span className="sr-only">{practiceMetaSpeech(pr)}</span>
      </div>
      {pr.alreadyOnToday && (
        <p className="rm-it-why">
          {named} is already on Today (from Milestone {pr.alreadyOnToday.fromOrd}).
        </p>
      )}
      {held === ACTIVITY_HELD_WAITING ? (
        // The reason is on screen once already (the sheet's "Waiting on your answer about activities →"): the row keeps "Not added to Today".
        <p className="rm-it-why rm-ss-held">
          <Glyph name="safe.ask" size={16} inherit />
          <span aria-hidden="true">{START_NOT_ADDED}</span>
          <span className="sr-only">{held}</span>
        </p>
      ) : held ? (
        <p className="rm-it-why">{held}</p>
      ) : (
        <div className="rm-sw" style={{ marginTop: 4 }}>
          <span className="rm-sw-t">{off ? "Not added: its sessions leave the plan's practice part" : "Add to Today"}</span>
          <Switch checked={!off} onChange={onToggle} label={`Add ${named} to Today`} />
        </div>
      )}
    </div>
  );
}

/** The sheet's practice switches, each with its words' class (the Start sheet's "Practices"). */
export function StartPractices({
  practices,
  milestone,
  isOff,
  onToggle,
  heldOf,
}: {
  practices: readonly StartPracticeRow[];
  milestone: MilestoneDraft;
  isOff: (lineageId: string) => boolean;
  onToggle: (lineageId: string) => void;
  /** Constraint safety (contracts §19): the line shown in place of a held practice's switch; null for the others. */
  heldOf?: (lineageId: string) => string | null;
}) {
  return (
    <>
      {practices.map((pr) => (
        <PracticeSwitchRow key={pr.lineageId} pr={pr} milestone={milestone} off={isOff(pr.lineageId)} onToggle={() => onToggle(pr.lineageId)} held={heldOf?.(pr.lineageId) ?? null} />
      ))}
    </>
  );
}

/**
 * The activity card asked inside a sheet (contracts §19; its "start"
 * variant), with the milestone's items waiting on the answer and those the
 * answers or words leave out. Null when none. The Start sheet itself no longer
 * renders it (ui-motion.md screen 7: the card isn't duplicated; the sheet
 * jumps to the page's card instead); kept for the confirm-to-unlock checks.
 */
export function StartActivities({ view, roadmapId, milestone, today }: { view: ActivityConfirmView | null | undefined; roadmapId: string | null; milestone: MilestoneDraft; today: string }) {
  const held = heldPracticesOf(milestone, view);
  const waiting = activityWaitingLine(held.waiting.map((it) => it.label));
  const leftOut = activityLeftOutLine(held.leftOut.map((it) => it.label));
  const asks = activityAsksOf(view) && roadmapId != null;
  if (!asks && !waiting && !leftOut) return null;
  return (
    <>
      <span className="t-eyebrow rm-sheet-eyebrow">Activities</span>
      {asks && roadmapId != null && <ActivityConfirmCard view={view} roadmapId={roadmapId} today={today} place="start" />}
      {waiting && <p className="t-meta rm-ink1">{waiting}</p>}
      {leftOut && <p className="t-meta">{leftOut}</p>}
    </>
  );
}

/** The steps going to Today, each as written with its words' class (never a bare joined line). */
export function StartSteps({ steps, milestone }: { steps: readonly { itemId: string; title: string }[]; milestone: MilestoneDraft }) {
  return (
    <ul className="rm-oi-list" aria-label="Steps going to Today">
      {steps.map((s) => (
        <li key={s.itemId} className="rm-oi">
          <EchoedLabel milestone={milestone} itemId={s.itemId} label={s.title} />
        </li>
      ))}
    </ul>
  );
}

/** "Week quests [quest.bring]2 [quest.add]3 [quest.practice]3 «pays nothing»": one glyph and count per quest; the words in the Key. */
function WeekQuestCounts({ set, track }: { set: WeekQuestSet; track: TrackSigil }) {
  if (set.quests.length === 0) return null;
  return (
    <p className="rm-ss-wq">
      <span className="sr-only">{`${SHORT_WEEK_QUESTS} if you start now: ${weekQuestLines(set).join("; ")}.`}</span>
      <span aria-hidden="true">{SHORT_WEEK_QUESTS}</span>
      {set.quests.map((q) => (
        <span key={q.ord} className="rm-ss-wqn" aria-hidden="true">
          <Glyph name={KIND_GLYPH[WQ_KIND[q.kind]]} track={track} size={16} inherit />
          {q.kind === "CHECKPOINT" ? null : q.count}
        </span>
      ))}
      <HonestyChip kind="pays-nothing" label={SHORT_PAYS_NOTHING} />
    </p>
  );
}

export interface StartSheetBodyProps {
  preview: StartPreview;
  milestone: MilestoneDraft;
  today: string;
  /** Constraint safety (contracts §19): the roadmap's activity answers (RoadmapView.activityConfirm). */
  activityConfirm?: ActivityConfirmView | null;
  roadmapId?: string | null;
  /** The Aim rank held now (RoadmapView.rank.index): drawn [rank.N done] beside "keeps your rank"; without it, the words alone. */
  heldRank?: number | null;
  /** Closes the sheet (after Start, and before the jump to the page's activity card). */
  onClose: () => void;
}

/** The sheet's body (no portal): the choices, the rows, the pay and the action. */
export function StartSheetBody({ preview: p, milestone, today, activityConfirm, roadmapId, heldRank, onClose }: StartSheetBodyProps) {
  const editor = useItemEditor();
  const [target, setTarget] = useState<StartChoices["target"]>("FITTED_NOW");
  const [over, setOver] = useState(false);
  const [off, setOff] = useState<Set<string>>(new Set());
  const { run, pending, error } = useRoadmapAction();
  const track: TrackSigil = editor ? TRACK_SIGIL[editor.scope.track] : "craft";

  // Practices already on Today from an earlier milestone start switched off.
  const initialOff = useMemo(() => new Set(p.practices.filter((x) => !x.on).map((x) => x.lineageId)), [p]);
  // Constraint safety (contracts §19): a practice the activity answers hold back is off, whatever its switch said.
  const held = useMemo(() => heldPracticesOf(milestone, activityConfirm), [milestone, activityConfirm]);
  const heldLine = useMemo(() => {
    const lines = new Map<string, string>();
    for (const it of held.leftOut) lines.set(it.lineageId, ACTIVITY_HELD_LEFT_OUT);
    for (const it of held.waiting) lines.set(it.lineageId, ACTIVITY_HELD_WAITING);
    return lines;
  }, [held]);
  const isOff = (lineage: string) => heldLine.has(lineage) || off.has(lineage) !== initialOff.has(lineage);

  const toCheck = rowsToCheck(p);
  const keepOver = p.todayCheck && target === "STORED";
  // The pay line for the switches as they stand now: the figure finishStartCore freezes into the goal (startPayOf).
  const offNow = p.practices.filter((x) => isOff(x.lineageId)).map((x) => x.lineageId);
  const pay = startPayOf(p, offNow, milestone.items);
  const restsOn = restsOnAddedOf(p);

  // pay-swap (ACT): the stated figure crossfades when the user's own switch just changed it, never on a reload.
  const payRef = useRef<HTMLSpanElement>(null);
  const actedAt = useRef(0);
  const payKey = `${pay.stated}:${pay.zeroReason ?? ""}`;
  const lastPay = useRef(payKey);
  useEffect(() => {
    const before = lastPay.current;
    lastPay.current = payKey;
    if (before !== payKey && Date.now() - actedAt.current < 1000) void playGlyph(payRef.current, "pay-swap", { licence: "ACT" });
  }, [payKey]);

  const start = () => {
    if (!milestone.id) return;
    if (keepOver && !over) return;
    const choices: StartChoices = {
      target: p.todayCheck ? target : "STORED",
      overAccepted: Boolean(keepOver && over),
      practicesOff: offNow,
      rules: {},
      decisions: {},
      edits: {},
    };
    run(
      (a) => a.startMilestone(milestone.id!, choices),
      () => {
        pushToast({ title: `Milestone ${p.ord} started`, body: "It is a Mid goal on Today now, with its practices and steps." });
        onClose();
      }
    );
  };

  const jump = () => {
    const first = toCheck[0];
    if (!first) return;
    const item = first.itemId ? milestone.items.find((it) => it.id === first.itemId) : null;
    const id = item ? (item.id ?? item.lineageId) : (milestone.id ?? milestone.lineageId);
    document.getElementById(rowDomId(id))?.scrollIntoView({ block: "center" });
  };

  // The page's own activity card answers the question (it isn't duplicated here): close the sheet, then bring the card in with focus.
  const toActivities = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onClose();
    window.setTimeout(() => {
      const card = document.getElementById(ACTIVITY_DOM_ID);
      card?.scrollIntoView({ block: "start" });
      card?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
    }, 320);
  };

  // D12: one health chip, only on a BODY track Area (or a milestone's note); dropped where a row's HEALTH flag already shows the line.
  const healthLine = (milestone.notes.includes("HEALTH_LINE") || (editor?.scope.areaFieldId == null && editor?.scope.track === "BODY")) && <p className="rm-it-why">{HEALTH_LINE}</p>;
  const rowFlags = [...p.todayRows.map((r) => (r.itemId ? (milestone.items.find((it) => it.id === r.itemId)?.flags ?? []) : titleItemOf(milestone).flags)), ...p.pending.map((it) => it.flags)];
  const healthFlagShown = rowFlags.some((f) => f.includes("HEALTH"));

  // Constraint safety: what the gate holds that has no switch of its own (a step, a checkpoint) keeps its line here.
  const switched = new Set(p.practices.map((x) => x.lineageId));
  const waitingLine = activityWaitingLine(held.waiting.filter((it) => !switched.has(it.lineageId)).map((it) => it.label));
  const leftOutLine = activityLeftOutLine(held.leftOut.filter((it) => !switched.has(it.lineageId)).map((it) => it.label));
  const asks = activityAsksOf(activityConfirm) && (roadmapId ?? editor?.scope.roadmapId) != null;

  const t = p.feasibility.time;
  const cap = startCapacityOf(t);
  const unverified = capacityFlagsOf(t).unverified;
  const rankIndex = p.givesRank ? AIM_RANKS.indexOf(p.givesRank) : heldRank != null && heldRank >= 0 && heldRank < AIM_RANKS.length ? heldRank : -1;

  // The sheet's Key (D13): each glyph with its words, every row's sr words, and the sentences the sheet used to print.
  const kinds = new Set(p.todayRows.map((r) => r.kind));
  const provs = p.todayRows.map((r) => {
    const it = r.itemId ? milestone.items.find((x) => x.id === r.itemId) : null;
    return startProvOf(it ? it.origin : milestone.titleOrigin, it ? it.decision : milestone.titleDecision);
  });
  // the items still to decide (ItemRow's rows) say their words sr-only too: the Key holds them for touch
  const pendingProvs = p.pending.map((it) => startProvOf(it.origin, it.decision));
  const keyEntries: KeyEntry[] = [
    ...(toCheck.length > 0 ? [{ glyph: "m.lock" as const, words: GLYPH_MEANS["m.lock"] }] : []),
    ...(kinds.has("TITLE") ? [{ glyph: (stageGlyphOf(milestone.stage, null)?.glyph ?? "route") as GlyphName, words: "This milestone, a Mid goal on Today" }] : []),
    ...(kinds.has("DOMAIN") ? [{ glyph: "s-know" as const, words: "A Domain: its cards count toward the milestone" }] : []),
    ...(["PRACTICE", "STEP", "CHECKPOINT"] as const).filter((k) => kinds.has(k)).map((k) => ({ glyph: KIND_GLYPH[WQ_KIND[k]], track, words: GLYPH_MEANS[KIND_GLYPH[WQ_KIND[k]]] })),
    ...[...new Set([...provs, ...pendingProvs].map((x): GlyphName => ("chip" in x ? (x.chip === "gemini" ? "pv.suggest" : "pv.kept") : PROVMARK_GLYPH[x.mark])))].map((g) => ({ glyph: g, words: GLYPH_MEANS[g] })),
    ...(p.todayCheck ? [{ glyph: "v.over" as const, words: "Over: kept above what your hours and pace fit" }] : []),
    { glyph: "c-mp" as const, words: "MP: what the Mid goal states it pays" },
    ...(p.practices.some((x) => x.price != null) ? [{ glyph: "c-xp" as const, words: "XP a practice session earns, about" }] : []),
    ...(rankIndex >= 0 ? [{ glyph: `rank.${rankIndex}` as GlyphName, state: p.givesRank ? ("active" as const) : ("done" as const), words: p.givesRank ? `Aim rank ${p.givesRank}: reaching this milestone gives it (not held yet)` : "The Aim rank you hold: this milestone keeps it" }] : []),
    ...(p.weekQuests && p.weekQuests.quests.length > 0 ? [{ glyph: "m.nopay" as const, words: GLYPH_MEANS["m.nopay"] }] : []),
  ];
  const keyRows = [
    ...p.todayRows.map((r, i) => {
      const it = r.itemId ? milestone.items.find((x) => x.id === r.itemId) : null;
      const kind = r.kind === "CHECKPOINT" && it?.checkpointKind ? `Checkpoint · ${CHECKPOINT_KIND_WORD[it.checkpointKind]}` : TODAY_KIND_WORD[r.kind];
      return `${kind} · ${r.label}: ${provs[i].words}`;
    }),
    ...p.pending.map((it, i) => `${it.kind.charAt(0) + it.kind.slice(1).toLowerCase()} · ${it.label}: ${pendingProvs[i].words}`),
    // a held practice's whole line (its row shows "Not added to Today" while the answer waits)
    ...p.practices.filter((x) => heldLine.has(x.lineageId)).map((x) => `${x.name}: ${heldLine.get(x.lineageId)}`),
  ];

  return (
    <div className="rm-ss" data-wc-block="start-sheet" data-fx="none">
      {p.refusal && (
        <p className="t-error" role="alert">
          {p.refusal}
        </p>
      )}

      <div className="rm-ss-top">
        <span className="rm-ss-lbl">{START_TARGET_WORD}</span>
        {p.todayCheck ? (
          <>
            <ChipButton pressed={target === "FITTED_NOW"} onClick={() => setTarget("FITTED_NOW")}>
              Use {p.todayCheck.fittedNow}
            </ChipButton>
            <ChipButton pressed={target === "STORED"} onClick={() => setTarget("STORED")}>
              Keep {p.todayCheck.stored} —{" "}
              <span className="rm-ss-over">
                <Glyph name="v.over" size={12} inherit />
                <span data-wc="honest">{SHORT_OVER}</span>
              </span>
            </ChipButton>
          </>
        ) : (
          <span className="rm-ss-ok">{START_TARGET_FITS}</span>
        )}
        <span className="rm-ss-sp" aria-hidden="true" />
        <CardKey entries={keyEntries} rows={keyRows} topic="the marks on this sheet">
          <span className="rm-ss-tl">{p.todayCheck ? p.todayCheck.reason : START_TARGET_FITS_LINE}</span>
          <span className="rm-ss-tl">
            <b>App-tracked time:</b> {timeSentence(t)} {TIME_FIXED_LINE}
          </span>
          <span className="rm-ss-tl">{payParagraph(p, pay, today)}</span>
          {p.pay.limitLine && <span className="rm-ss-tl">{p.pay.limitLine}</span>}
          {p.weekQuests && (
            <>
              <span className="rm-ss-tl">{weekQuestFooter(p.weekQuests, today)}</span>
              {weekQuestLines(p.weekQuests).map((l) => (
                <span key={l} className="rm-ss-tl">
                  {l}
                </span>
              ))}
            </>
          )}
        </CardKey>
      </div>
      {keepOver && (
        <div className="rm-sw">
          <span className="rm-sw-t">Keep it over my hours/pace</span>
          <Switch checked={over} onChange={setOver} label="Keep it over my hours/pace" />
        </div>
      )}

      <div className="rm-ss-cap">
        {cap ? (
          <CapacityGauge need={cap.need} have={cap.have} unit="/wk" verdict={t.verdict} unverified={unverified} label={timeSentence(t)} needWord={SHORT_NEED} haveWord={cap.yours ? SHORT_YOURS : SHORT_HAVE} />
        ) : (
          <div className="rm-ss-capx">
            <VerdictChip verdict={t.verdict} unverified={unverified} />
            <p className="t-meta">{timeSentence(t)}</p>
          </div>
        )}
      </div>

      {p.pending.length > 0 && (
        <div className="rm-ss-list">
          <span className="t-eyebrow rm-ss-eb">{shortToDecide(p.pending.length)}</span>
          {p.pending.map((it) => (
            <ItemRow key={it.id ?? it.lineageId} target={{ row: editorRowOf(it), item: it, milestone }} stage="start" kindLabel={it.kind.charAt(0) + it.kind.slice(1).toLowerCase()} />
          ))}
        </div>
      )}

      <div className="rm-ss-list">
        <div className="rm-ss-sec">
          <span className="t-eyebrow rm-ss-eb">{START_TODAY_HEAD}</span>
          {toCheck.length > 0 && (
            <InfoTip topic="the rows still to check">
              {toCheck.map((r) => (
                <span key={`${r.kind}-${r.itemId ?? "title"}`} className="rm-ss-tl">
                  {`${r.label}: ${NEEDS[r.needs].why}`}
                </span>
              ))}
            </InfoTip>
          )}
        </div>
        {p.todayRows.map((r) => (
          <TodayRowView key={`${r.kind}-${r.itemId ?? "title"}`} row={r} milestone={milestone} track={track} />
        ))}
      </div>

      {p.practices.length > 0 && (
        <div className="rm-ss-list">
          <span className="t-eyebrow rm-ss-eb">{START_PRACTICES_HEAD}</span>
          <StartPractices
            practices={p.practices}
            milestone={milestone}
            isOff={isOff}
            onToggle={(lineage) => {
              actedAt.current = Date.now();
              setOff((s) => new Set(s.has(lineage) ? [...s].filter((x) => x !== lineage) : [...s, lineage]));
            }}
            heldOf={(lineage) => heldLine.get(lineage) ?? null}
          />
        </div>
      )}

      {p.steps.length > 0 && (
        <div className="rm-ss-list">
          <span className="t-eyebrow rm-ss-eb">{SHORT_SECTION.steps}</span>
          <StartSteps steps={p.steps} milestone={milestone} />
        </div>
      )}

      <div className="rm-ss-pay">
        <span ref={payRef} className="rm-ss-payv">
          {pay.stated > 0 ? (
            // "pays ⬡ 6 × progress «from 70%»": the stated rate, drawn as the Now card draws it (PaysLine, data-wc="honest")
            <PaysLine text={statedLine(pay.stated, pay.zeroReason, pay.paidOn, today)} />
          ) : (
            <HonestyChip kind="pays-nothing-ms" label={SHORT_PAYS_NOTHING} full={statedLine(pay.stated, pay.zeroReason, pay.paidOn, today)} />
          )}
        </span>
        {pay.stated > 0 && restsOn && <HonestyChip kind="rests-on-added" label={SHORT_RESTS_ON_ADDED} full={restsOnAddedLine(pay.stated, restsOn)} />}
        {pay.stated > 0 && (
          // the floor tick: where the pay starts (payBar MID); a scale only, nothing measured is drawn on it
          <span className="rm-ss-floor" aria-hidden="true" style={{ ["--f" as string]: payBar("MID") }}>
            <i />
          </span>
        )}
      </div>

      <p className="rm-ss-rank">
        {p.givesRank ? (
          <>
            {SHORT_GIVES_RANK} {rankIndex >= 0 && <Glyph name={`rank.${rankIndex}` as GlyphName} state="active" size={16} inherit />}
            <b data-wc="name">{p.givesRank}</b>
          </>
        ) : (
          <>
            {rankIndex >= 0 && <Glyph name={`rank.${rankIndex}` as GlyphName} state="done" size={16} inherit />}
            {SHORT_KEEPS_RANK}
          </>
        )}
      </p>

      {p.weekQuests && (p.weekQuests.quests.length > 0 ? <WeekQuestCounts set={p.weekQuests} track={track} /> : <p className="t-meta">{weekQuestFooter(p.weekQuests, today)}</p>)}

      {(asks || waitingLine || leftOutLine) && (
        <div className="rm-ss-act">
          {asks && (
            <a className="rm-ss-jump" href={`#${ACTIVITY_DOM_ID}`} onClick={toActivities}>
              <Mark glyph={`s-${track}`} size={16} />
              <span>{SHORT_WAITING_ACTIVITIES}</span>
              <span aria-hidden="true">→</span>
            </a>
          )}
          {waitingLine && <p className="t-meta rm-ink1">{waitingLine}</p>}
          {leftOutLine && <p className="t-meta">{leftOutLine}</p>}
        </div>
      )}

      {healthLine && !healthFlagShown && (
        <Chips>
          {/* a safety surface (D11): its panel opens instantly */}
          <span data-safety="">
            <HonestyChip kind="health" label={SHORT_HEALTH} full={healthLine} />
          </span>
        </Chips>
      )}

      <div className="rm-sticky rm-static">
        {!p.goalsLive ? (
          <p className="t-meta">Starting milestones arrives with the next update.</p>
        ) : p.canStart && !p.refusal ? (
          <>
            <Button variant="primary" size="lg" onClick={start} disabled={pending}>
              {pending ? "Starting…" : `Start milestone ${p.ord}`}
            </Button>
            {keepOver && !over && <p className="t-meta">Turn on “Keep it over my hours/pace” to keep {p.todayCheck?.stored}.</p>}
          </>
        ) : toCheck.length > 0 ? (
          <>
            <Button variant="primary" size="lg" onClick={jump}>
              Next row to check
            </Button>
            <div className="rm-ss-gate">
              <span className="t-meta">{shortRowsLeft(toCheck.length)}</span>
              <InfoTip topic="when Start is offered">{startGateLine(toCheck.length)}</InfoTip>
            </div>
          </>
        ) : (
          // The refusal names a row in its words ("Set the bar for the checkpoint “Self-test: …”"): a Gemini-named Domain there keeps its mark.
          <p className="t-meta">
            <MarkedLabel label={p.blockers[0] ?? p.refusal ?? "Start isn't offered yet."} marks={libraryMarksOf(editor?.scope.library)} />
          </p>
        )}
        {error && <ActionError>{error}</ActionError>}
      </div>
    </div>
  );
}

export function StartSheet({
  open,
  onClose,
  milestone,
  today,
  initial,
  activityConfirm,
  roadmapId,
  heldRank,
}: {
  open: boolean;
  onClose: () => void;
  milestone: MilestoneDraft;
  today: string;
  /** A preview already in hand (fixtures); otherwise it loads when the sheet opens. */
  initial?: StartPreview | null;
  /** Constraint safety (contracts §19): the roadmap's activity answers (RoadmapView.activityConfirm) and its id. */
  activityConfirm?: ActivityConfirmView | null;
  roadmapId?: string | null;
  /** The Aim rank held now (RoadmapView.rank.index), for "[rank.N done] keeps your rank". */
  heldRank?: number | null;
}) {
  const runtime = useRoadmapRuntime();
  const [preview, setPreview] = useState<StartPreview | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!milestone.id || initial) return;
    runtime.actions
      .loadStartPreview(milestone.id)
      .then((res) => {
        if (res.ok) {
          setPreview(res.value);
          setLoadError(null);
        } else setLoadError(res.error);
      })
      .catch(() => setLoadError("The Start sheet didn't load. Try again."));
  }, [milestone.id, initial, runtime.actions]);

  // Load when opened, and again whenever the milestone's rows change (a decision taken on the sheet).
  useEffect(() => {
    if (open) load();
  }, [open, load, milestone]);

  return (
    <Sheet open={open} onClose={onClose} title={`Start milestone ${milestone.ord}`} description={<StartSheetDates milestone={milestone} today={today} />}>
      {!preview && !loadError && <p className="t-meta">Working out today&apos;s check…</p>}
      {loadError && <ActionError>{loadError}</ActionError>}
      {preview && <StartSheetBody preview={preview} milestone={milestone} today={today} activityConfirm={activityConfirm} roadmapId={roadmapId} heldRank={heldRank} onClose={onClose} />}
    </Sheet>
  );
}

/** Whether a Today-bound row's class lets it reach Today (YOURS or WORKED_OUT). */
export function todayBoundOk(origin: Parameters<typeof provenanceOf>[0], decision: Parameters<typeof provenanceOf>[1]): boolean {
  const c = provenanceOf(origin, decision);
  return c === "YOURS" || c === "WORKED_OUT";
}
