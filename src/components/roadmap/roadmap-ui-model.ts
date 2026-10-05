/**
 * The roadmap UI's pure view builders (lane R5; F9, F12, F17, F18, F19).
 * Every decision about what a surface shows (which buttons an item offers,
 * which week quest rows Today shows first, which rank a milestone gives, how
 * the Milestones strip maps) is made here, so roadmap-ui-check can pin it
 * without rendering. Pure and client-importable; no constructor of a number
 * or text brand is called here (the figures arrive branded in the views).
 *
 *   Library      LibraryDomain (the contract's) · domainIndexOf · scopeNamesOf · libraryLoaded · canMapOf
 *   Items        itemClassOf · itemActionsOf · bulkKeepCountOf · undecidedOf (= draftNeedsOf) · titleItemOf · displayLabelOf
 *   Measures     measureDomainClassOf
 *   Ranks        rankPlanOf · paragonLineShown
 *   Week quests  weekQuestRowsForToday · practiceNameOf · weekQuestAccessibleName · weekQuestKindsOf · notesShownOf
 *   Milestones   positionsOf · milestoneSegmentsOf (one per place) · milestoneRowLine · scheduledOf · startAgainOffered
 *   Runs         draftRunWriterOf · draftBannerOf · referenceRunOf · draftHasGeminiWords
 *   Verdicts     typedTargetVerdict
 *   Start pay    startPayOf
 *   Aim figure   aimFigureOf
 *   Progression  PROGRESSION_PROMPT_VERSION · picksAreChoicesOf · rowsAreProgressionOf · stageRunOf (StageRun) · stageLevelOf · stageOptionsOf ·
 *                geminiChoiceOf (GeminiChoice) · pendingChoicesOf · practiceTurnOf · rowsAreManualOf · appPracticeOf · stageWhysOf (StageWhy, StageEnd) ·
 *                geminiV4PartsOf (GeminiV4Parts) · geminiAsksOf (GeminiAsks) (contracts §20)
 *   Activities   activityCardOf · activityAsksOf · activitySuggestsOf · activityOpenOf · activityAvoidOf · activityCardAnswerOf ·
 *                activityNothingToAvoidOf · activityBlockedOf · pickerExcludedOf · activityWaitingOf · heldPracticesOf ·
 *                practiceOnlyLineOf · sessionSwapKindsOf · rowsAnsweredBy · intakeActivityOf · aimConflictLineOf · pausedOfReply ·
 *                notPausedOfReply · pausedItemsOf (TaskSeen, PauseState) · pausedOfMeasure (§19)
 *   UI motion    seen keys (SeenBases · seenBasesOfRoadmap · seenBasesOfAimCard · seenBasesOfWeekQuests · seenKeyOf · seenBaseOf ·
 *                proficiencyBasisKeyOf · SeenSeed · seenSeedsOf · seenStorageOf · daySeenValue) ·
 *                rankSealOf · railNodesOf · aimRailOf · countedReachOf · pipDaysOf · rowPipsOf · horizonOfAimCard ·
 *                horizonOfRoadmap · aimDateOfHeader · aimDateOfCard · realismFlagsOf · capacityFlagsOf · paceFlagsOf ·
 *                geminiLaneItemsOf · healthChipShown (ui-motion.md §9.3, contracts §21)
 */
import {
  ACTIVITY_REASON_MAX,
  PACK_MAX_DOMAINS,
  PARAGON_MIN_MILESTONES,
  PRACTICES_PER_MILESTONE,
  SOURCE_NOTE_MAX,
  TYPICAL_HOURS_MAX,
  TYPICAL_HOURS_MIN,
  WEEK_QUEST_ROWS_TODAY,
  draftNeedsOf,
  parseMeasureKey,
  positionCountOf,
  practiceMinutesPerWeekOf,
  provenanceOf,
  rankIndexAt,
  runWriterOf,
  startStatedInputOf,
  userClauseOf,
  type ActivityCardAnswer,
  type ActivityConfirm,
  type ActivityConfirmView,
  type ActivityRow,
  type AimCardView,
  type AimRankName,
  type AimRankView,
  type BlockingFlag,
  type CueTexts,
  type CurrentMilestoneView,
  type DateCheck,
  type Decision,
  type Feasibility,
  type GateStage,
  type ItemDraft,
  type ItemKind,
  type KnowledgeCheck,
  type KnowledgeVerdict,
  type LibraryDomain,
  type MilestoneDraft,
  type MilestoneRowView,
  type MilestoneStatus,
  type MeasureRowView,
  type PaceResult,
  type PracticeFamily,
  type PracticePace,
  type Origin,
  type ProficiencyView,
  type DraftView,
  type RoadmapHeader,
  type RoadmapStatus,
  type RoadmapView,
  type RunView,
  type RunWriter,
  type StartPreview,
  type StageKey,
  type StatedZeroReason,
  type TextClass,
  type Throughput,
  type TimeCheck,
  type WeekQuestKind,
  type WeekQuestRow,
  type WeekQuestsView,
} from "@/lib/roadmap-types";
import { statedForMilestone } from "@/lib/roadmap-economy";
import {
  PROGRESSION,
  activityConfirmViewOf,
  allowedKindsFor,
  catalogEntryOf,
  catalogKindsFor,
  catalogTrackOf,
  constraintsStateOf,
  cueSafeKindsOf,
  isCatalogKey,
  practiceFamilyOf,
  practiceTurnOfLabel,
  progressionCandidatesOf,
  type CatalogKey,
  type CatalogTrack,
  type PracticeKind,
  type ProgressionRung,
} from "@/lib/roadmap-catalog";
import { constraintExclusionsOf } from "@/lib/roadmap-validate";
import { addDays, weekStartKeyOf, type DayKey } from "@/lib/life-day";
import { hashSeed } from "@/lib/motion";
import type { Track } from "@/lib/life-types";
import type { Segment } from "@/components/ui/Meter";
// Types only (erased): the glyph layer's shapes the UI-motion builders fill (ui-motion.md §4.5, §5.6).
import type { PipDay } from "@/components/glyph/PipStrip";
import type { StageGate } from "@/components/glyph/paths/stage";
import type { SeenKey } from "@/components/glyph/useSeen";
import {
  DRAFTED_BY_LABEL,
  DRAFT_CAP_LINE,
  LATEST_RUN_LABEL,
  RUN_REFUSED_LINE,
  RUN_STARTER_LINE,
  RUN_UNFINISHED_LINE,
  activityPendingLine,
  aimConflictLine,
  closedUnreachedLine,
  GEMINI_LANE_ITEM,
  dayLabel,
  dueDaysLabel,
  givesRankLine,
  heldRowLine,
  pastDueLine,
  pendingReachLine,
  shortDateBy,
  shortDatePlain,
  shortDateYours,
  weekQuestCountLine,
  weekdayName,
  type StageEnd,
} from "./roadmap-copy";

// ═══ The user's library (RoadmapView.library, the contract's LibraryDomain) ═══

/** The contract's Domain facts (roadmap-types LibraryDomain), re-exported for the components. */
export type { LibraryDomain };

/**
 * Whether the view carries the user's Domains. undefined means "not loaded
 * here": no [Map to…] picker, no "Add a Domain", and the Create sheet says
 * "Your Domains weren't checked here" — never "None of your Domains is
 * similar", which would claim a comparison that never ran.
 */
export function libraryLoaded(library: readonly LibraryDomain[] | undefined): library is readonly LibraryDomain[] {
  return Array.isArray(library);
}

/** [Map to…] needs a picker with something in it. */
export function canMapOf(library: readonly LibraryDomain[] | undefined): boolean {
  return libraryLoaded(library) && library.length > 0;
}

/** id → the Domain's facts, from the library and the milestone's own DOMAIN items. */
export function domainIndexOf(view: Pick<RoadmapView, "library" | "draft" | "current">): Map<string, LibraryDomain | { id: string; name: string }> {
  const out = new Map<string, LibraryDomain | { id: string; name: string }>();
  const fromItems = (ms: readonly MilestoneDraft[]) => {
    for (const m of ms) for (const it of m.items) if (it.kind === "DOMAIN" && it.domainId && !out.has(it.domainId)) out.set(it.domainId, { id: it.domainId, name: it.label });
  };
  if (view.draft) fromItems(view.draft.milestones);
  if (view.current) fromItems([view.current.milestone]);
  for (const d of view.library ?? []) out.set(d.id, d);
  return out;
}

/** "Risk Management, Position Sizing" for a card measure (its key's ids), or null when the names aren't known. */
export function scopeNamesOf(domainIds: readonly string[], index: ReadonlyMap<string, { name: string }>): string | null {
  const names = domainIds.map((id) => index.get(id)?.name).filter((n): n is string => Boolean(n));
  return names.length === domainIds.length && names.length > 0 ? names.join(", ") : null;
}

// ═══ Items (F9) ══════════════════════════════════════════════════════════════

/** A row the editor decides: a real item, or the milestone's title (decided through its milestone id). */
export interface EditorRow {
  /** The id decideItem / editItem take: the item's id, or the milestone's id for its title. */
  id: string;
  kind: ItemKind | "TITLE";
  label: string;
  origin: Origin;
  decision: Decision;
  flags: readonly BlockingFlag[];
  /** DOMAIN: the resolved Domain (null: proposed, "Not in your library yet"). */
  domainId: string | null;
  proposed: boolean;
  placeholder: boolean;
  /** NUMBER spans to strike, as the server derived them (ItemDraft.struck, MilestoneDraft.titleStruck); undefined: not derived here. */
  struck?: readonly [number, number][];
  /** Each flag's reason naming what set it (ItemDraft.reasons, MilestoneDraft.titleReasons); undefined: not derived here. */
  reasons?: Partial<Record<BlockingFlag, string>>;
  /** Revision 4: a code-worded type from roadmap-catalog (a practice, step or checkpoint); its type can be changed in one tap (F-R4-21). */
  catalogKey?: CatalogKey | null;
}

/**
 * The title as an editor row. A Gemini title carries the flags R4 derives on
 * read (MilestoneDraft.titleFlags): a NUMBER title offers only Edit, and bulk
 * keep skips any flagged title. A title the user wrote or checked carries none.
 */
export function titleItemOf(m: MilestoneDraft): EditorRow {
  const cls = provenanceOf(m.titleOrigin, m.titleDecision);
  const gemini = cls === "DRAFT" || cls === "KEPT_SUGGESTION";
  return {
    id: m.id ?? m.lineageId,
    kind: "TITLE",
    label: m.title,
    origin: m.titleOrigin,
    decision: m.titleDecision,
    flags: gemini ? (m.titleFlags ?? []) : [],
    domainId: null,
    proposed: false,
    placeholder: false,
    struck: gemini ? m.titleStruck : undefined,
    reasons: gemini ? m.titleReasons : undefined,
  };
}

/** An item as an editor row. */
export function editorRowOf(it: ItemDraft): EditorRow {
  return {
    id: it.id ?? it.lineageId,
    kind: it.kind,
    label: it.label,
    origin: it.origin,
    decision: it.decision,
    flags: it.flags,
    domainId: it.domainId,
    proposed: it.kind === "DOMAIN" && !it.domainId,
    placeholder: it.notes.includes("PLACEHOLDER"),
    struck: it.struck,
    reasons: it.reasons,
    catalogKey: it.catalogKey ?? null,
  };
}

/** The string class of a row (derived on read, never stored). */
export function itemClassOf(row: Pick<EditorRow, "origin" | "decision">): TextClass {
  return provenanceOf(row.origin, row.decision);
}

/**
 * What a flagged row shows: the server's struck spans and reasons, and only
 * where they are absent the device's own re-check (R3's checkLabel, client-
 * safe) — a fallback, since the device lacks the roadmap's full context (the
 * syllabus). Spans are struck only for a NUMBER the row carries, and reasons
 * only for its own flags: the server decides the flags.
 */
export function displayLabelOf(
  row: Pick<EditorRow, "flags" | "struck" | "reasons">,
  recheck: { struck: readonly [number, number][]; reasons?: Partial<Record<BlockingFlag, string>> } | null
): { struck: readonly [number, number][] | undefined; reasons: Partial<Record<BlockingFlag, string>> | undefined } {
  const struck = row.struck ?? (row.flags.includes("NUMBER") && recheck && recheck.struck.length > 0 ? recheck.struck : undefined);
  let reasons = row.reasons;
  if (!reasons && recheck?.reasons) {
    const own: Partial<Record<BlockingFlag, string>> = {};
    for (const f of row.flags) if (recheck.reasons[f]) own[f] = recheck.reasons[f];
    reasons = Object.keys(own).length > 0 ? own : undefined;
  }
  return { struck, reasons };
}

/** Whether a row needs the device's re-check: Gemini's flagged words with no server-derived spans or reasons. */
export function needsRecheckOf(row: EditorRow): boolean {
  const cls = itemClassOf(row);
  if (cls !== "DRAFT" && cls !== "KEPT_SUGGESTION") return false;
  if (row.flags.length === 0) return false;
  return (row.flags.includes("NUMBER") && row.struck === undefined) || row.reasons === undefined;
}

export type ItemAction = "KEEP" | "EDIT" | "REMOVE" | "CHECK" | "MAP" | "CREATE" | "DROP" | "TYPE" | "DEFAULT" | "KEEP_PICK";

/** What a row offers: all of them from 380 px; below it the first is a button and the rest sit in ⋯. */
export interface ItemActions {
  wide: ItemAction[];
  narrow: { shown: ItemAction[]; more: ItemAction[] };
}

const NONE: ItemActions = { wide: [], narrow: { shown: [], more: [] } };

function withoutMap(a: ItemActions): ItemActions {
  const keep = (x: ItemAction) => x !== "MAP";
  const shown = a.narrow.shown.filter(keep);
  const more = a.narrow.more.filter(keep);
  return { wide: a.wide.filter(keep), narrow: shown.length > 0 || more.length === 0 ? { shown, more } : { shown: [more[0]], more: more.slice(1) } };
}

/**
 * The buttons of one row (F9 "Each item"; F15 Today-bound rows):
 *   DRAFT (Gemini, undecided): Keep · Edit · Remove · I checked this; a NUMBER item offers only Edit and Remove
 *     (never Keep, never "I checked this"); a NUMBER title only Edit; a Domain Gemini picked leads with
 *     I checked this and Map to…; a proposed Domain offers Create · Map to… · Drop; the title has no Remove.
 *   KEPT_SUGGESTION: I checked this and Edit (Map to… for a Domain), kept in ⋯ on the living roadmap.
 *   A placeholder practice: Edit ("Name this practice").
 *   Gemini's choice that isn't the app's default (`choice`, geminiChoiceOf; contracts §20), on a draft: Use the app's
 *     default first (one tap) and, while it still waits on you (PENDING: accept waits on it), Keep Gemini's choice;
 *     then Change the type and Edit.
 *   YOURS, WORKED_OUT and REMOVED rows: none.
 * An outline row (a later milestone) offers nothing: it is decided at its Start.
 * Without the user's Domains on the page (`canMap` false) no row offers Map to….
 */
export function itemActionsOf(row: EditorRow, stage: "draft" | "outline" | "active" | "start", opts: { canMap?: boolean; choice?: Pick<GeminiChoice, "isDefault"> | null } = {}): ItemActions {
  const base = baseActionsOf(row, stage);
  const out = opts.choice && !opts.choice.isDefault && base.wide.includes("TYPE") ? withDefault(base, row.decision === "PENDING") : base;
  return opts.canMap === false ? withoutMap(out) : out;
}

/**
 * Gemini's choice that isn't the app's default (contracts §20): one tap puts
 * the app's default back ("Use the app's default"; the type change R4's
 * editItem makes, so it reads "you chose this"). It leads the row, before
 * Change the type. While the choice still waits on you (`pending`: accept
 * waits on it, R4's DECIDE_PRACTICE_PICKS) "Keep Gemini's choice" sits
 * beside it (R4's decideItem CHECKED on a waiting pick), both shown at any
 * width: the two answers to one question.
 */
function withDefault(a: ItemActions, pending: boolean): ItemActions {
  const lead: ItemAction[] = pending ? ["DEFAULT", "KEEP_PICK"] : ["DEFAULT"];
  return { wide: [...lead, ...a.wide], narrow: { shown: lead, more: [...a.narrow.shown, ...a.narrow.more] } };
}

function baseActionsOf(row: EditorRow, stage: "draft" | "outline" | "active" | "start"): ItemActions {
  if (stage === "outline" || row.decision === "REMOVED") return NONE;
  const cls = itemClassOf(row);
  if (row.proposed) {
    const all: ItemAction[] = row.decision === "PENDING" || cls === "KEPT_SUGGESTION" ? ["CREATE", "MAP", "DROP"] : [];
    return { wide: all, narrow: { shown: all, more: [] } };
  }
  const number = row.flags.includes("NUMBER");
  // A title with no words (the checker dropped Gemini's to '') can't be kept or checked: only named (fix round 2's carry-over).
  if (row.kind === "TITLE" && !row.label.trim() && (cls === "DRAFT" || cls === "KEPT_SUGGESTION")) return { wide: ["EDIT"], narrow: { shown: ["EDIT"], more: [] } };
  if (cls === "DRAFT") {
    if (row.kind === "DOMAIN") return { wide: ["CHECK", "MAP", "KEEP", "REMOVE"], narrow: { shown: ["CHECK"], more: ["MAP", "KEEP", "REMOVE"] } };
    if (number && row.kind === "TITLE") return { wide: ["EDIT"], narrow: { shown: ["EDIT"], more: [] } };
    if (number) return { wide: ["EDIT", "REMOVE"], narrow: { shown: ["EDIT"], more: ["REMOVE"] } };
    if (row.kind === "TITLE") return { wide: ["KEEP", "EDIT", "CHECK"], narrow: { shown: ["KEEP"], more: ["EDIT", "CHECK"] } };
    return { wide: ["KEEP", "EDIT", "REMOVE", "CHECK"], narrow: { shown: ["KEEP"], more: ["EDIT", "REMOVE", "CHECK"] } };
  }
  if (cls === "KEPT_SUGGESTION") {
    // A NUMBER can't be kept (the server refuses it); were one kept anyway, Edit is still all it offers.
    const pair: ItemAction[] = row.kind === "DOMAIN" ? ["CHECK", "MAP"] : number ? ["EDIT"] : ["CHECK", "EDIT"];
    if (stage === "active") return { wide: [], narrow: { shown: [], more: pair } };
    return { wide: pair, narrow: { shown: [pair[0]], more: pair.slice(1) } };
  }
  if (row.placeholder) return { wide: ["EDIT"], narrow: { shown: ["EDIT"], more: [] } };
  // Revision 4 (F-R4-18, F-R4-21): a code-worded type on a draft can be swapped for another from the app's list, or its words edited (YOURS).
  if (row.catalogKey && stage === "draft" && (row.kind === "PRACTICE" || row.kind === "STEP" || row.kind === "CHECKPOINT")) return { wide: ["TYPE", "EDIT"], narrow: { shown: ["TYPE"], more: ["EDIT"] } };
  return NONE;
}

/** The words of an action button. */
export const ITEM_ACTION_WORD: Readonly<Record<ItemAction, string>> = {
  KEEP: "Keep",
  EDIT: "Edit",
  REMOVE: "Remove",
  CHECK: "I checked this",
  MAP: "Map to…",
  CREATE: "Create",
  DROP: "Drop",
  TYPE: "Change the type",
  DEFAULT: "Use the app's default",
  KEEP_PICK: "Keep Gemini's choice",
};

/** An action's words on a row: an empty title's Edit reads "Name this milestone". */
export function actionWordOf(row: Pick<EditorRow, "kind" | "label">, a: ItemAction): string {
  if (a === "EDIT" && row.kind === "TITLE" && !row.label.trim()) return "Name this milestone";
  return ITEM_ACTION_WORD[a];
}

/** Items "Keep this milestone's unflagged suggestions" would keep: Gemini's undecided, unflagged items (and an unflagged title with words); never a proposed Domain. */
export function bulkKeepRowsOf(m: MilestoneDraft): EditorRow[] {
  const rows: EditorRow[] = [];
  const title = titleItemOf(m);
  if (itemClassOf(title) === "DRAFT" && title.flags.length === 0 && title.label.trim().length > 0) rows.push(title);
  for (const it of m.items) {
    const row = editorRowOf(it);
    if (itemClassOf(row) !== "DRAFT" || row.proposed || row.flags.length > 0) continue;
    rows.push(row);
  }
  return rows;
}

export function bulkKeepCountOf(m: MilestoneDraft): number {
  return bulkKeepRowsOf(m).length;
}

/**
 * What still needs the user in the next milestone, in reading order (the
 * "Next item to decide" target first): the contract's one definition,
 * draftNeedsOf (fix round 2), mapped to editor rows. A PENDING syllabus topic,
 * a row the user wrote and a placeholder already named need no tap, so the
 * footer's "N items left", the Aim card's count (R4's undecidedRowsOf) and
 * the scroll target agree and never land on a row with no button.
 */
export function undecidedOf(m: MilestoneDraft): EditorRow[] {
  const out: EditorRow[] = [];
  for (const need of draftNeedsOf(m)) {
    if (need.kind === "TITLE") {
      out.push(titleItemOf(m));
      continue;
    }
    const it = m.items.find((x) => x.lineageId === need.lineageId && x.kind === need.kind) ?? m.items.find((x) => need.id != null && x.id === need.id);
    if (it) out.push(editorRowOf(it));
  }
  return out;
}

/** The DOM id of a row, for "Next item to decide" to scroll to. */
export function rowDomId(id: string): string {
  return `rm-row-${id}`;
}

// ═══ Measures: the propagation rule (F9 Measures; the contract §9.3) ═══════════

/**
 * The weakest class of the Domain items a card measure is worked out over:
 * DRAFT while any of them is Gemini's undecided pick, KEPT_SUGGESTION while
 * any is only kept, else null ("worked out on Gemini's suggested Domains"
 * until those Domain items are checked or edited). The scope's Domains when it
 * names them; every live Domain item when it doesn't (each still a proposal).
 */
export function measureDomainClassOf(m: Pick<MilestoneDraft, "items">, domainIds: readonly string[] | undefined): "DRAFT" | "KEPT_SUGGESTION" | null {
  const scope = new Set(domainIds ?? []);
  const items = m.items.filter((it) => it.kind === "DOMAIN" && it.decision !== "REMOVED" && (scope.size === 0 || (it.domainId != null && scope.has(it.domainId))));
  const classes = items.map((it) => provenanceOf(it.origin, it.decision));
  if (classes.includes("DRAFT")) return "DRAFT";
  if (classes.includes("KEPT_SUGGESTION")) return "KEPT_SUGGESTION";
  return null;
}

// ═══ Ranks (F12) ═════════════════════════════════════════════════════════════

const UNSCHEDULED: ReadonlySet<MilestoneStatus> = new Set(["LATER", "SUPERSEDED", "DISCARDED"]);

/** The scheduled milestones of a plan, in plan order. */
export function scheduledOf<T extends { status: MilestoneStatus; ord: number }>(ms: readonly T[]): T[] {
  return ms.filter((m) => !UNSCHEDULED.has(m.status)).sort((a, b) => a.ord - b.ord);
}

/** The rank each scheduled milestone carries and whether reaching it raises the rank. */
export interface RankPlanEntry {
  rankIndex: number | null;
  gives: boolean;
  /** The last scheduled milestone of a plan of PARAGON_MIN_MILESTONES or more: the aim gives Paragon. */
  paragonAfter: boolean;
}

/** The milestones a re-plan carries (started once: their place and rank are kept); PLANNED, OUTLINE and LATER rows are re-planned. */
export function carriedRowsOf(rows: readonly Pick<MilestoneRowView, "lineageId" | "state" | "rankIndex">[]): { lineageId: string; rankIndex: number | null }[] {
  return rows.filter((r) => r.state !== "PLANNED" && r.state !== "OUTLINE" && r.state !== "LATER").map((r) => ({ lineageId: r.lineageId, rankIndex: r.rankIndex }));
}

/**
 * WORKED_OUT from the plan's places: a stored rankIndex (accepted rows), else
 * rankIndexAt(place) for a draft (assignRankIndices writes it at Accept). A
 * place is a position, one per lineage (the contract §9.1): a re-plan's
 * milestones come after the carried ones, so with milestones 1 and 2 carried
 * the re-plan's first milestone takes place 3. A milestone gives a rank only
 * when it carries one above every earlier one, carried ranks included.
 */
export function rankPlanOf(
  ms: readonly { id: string | null; lineageId: string; status: MilestoneStatus; ord: number; rankIndex: number | null }[],
  carried: readonly { lineageId: string; rankIndex: number | null }[] = []
): Record<string, RankPlanEntry> {
  const out: Record<string, RankPlanEntry> = {};
  const carriedLineages = new Set(carried.map((c) => c.lineageId));
  const sched = scheduledOf(ms).filter((m) => !carriedLineages.has(m.lineageId));
  const placesBefore = carriedLineages.size;
  let best = Math.max(0, ...carried.map((c) => c.rankIndex ?? 0));
  sched.forEach((m, i) => {
    const idx = m.rankIndex ?? rankIndexAt(placesBefore + i + 1);
    out[m.id ?? m.lineageId] = { rankIndex: idx, gives: idx > best, paragonAfter: placesBefore + sched.length >= PARAGON_MIN_MILESTONES && i === sched.length - 1 };
    best = Math.max(best, idx);
  });
  for (const m of ms) {
    const key = m.id ?? m.lineageId;
    if (!(key in out)) out[key] = { rankIndex: null, gives: false, paragonAfter: false };
  }
  return out;
}

// ═══ Week quests (F17) ═══════════════════════════════════════════════════════

const TODAY_ORDER: Readonly<Record<WeekQuestKind, number>> = { RAISE: 0, ADD: 1, STEP: 2, PRACTICE: 3, CHECKPOINT: 4 };

/** Today's order: RAISE, ADD, STEP, PRACTICE, CHECKPOINT; open rows first, then done ones. */
export function weekQuestRowsForToday(rows: readonly WeekQuestRow[]): WeekQuestRow[] {
  return [...rows].sort((a, b) => Number(a.done) - Number(b.done) || TODAY_ORDER[a.kind] - TODAY_ORDER[b.kind] || a.ord - b.ord);
}

/** Today shows this many before its "n more" toggle. */
export function weekQuestRowsShown(rows: readonly WeekQuestRow[], expanded: boolean): { shown: WeekQuestRow[]; hidden: number } {
  const ordered = weekQuestRowsForToday(rows);
  if (expanded || ordered.length <= WEEK_QUEST_ROWS_TODAY) return { shown: ordered, hidden: 0 };
  return { shown: ordered.slice(0, WEEK_QUEST_ROWS_TODAY), hidden: ordered.length - WEEK_QUEST_ROWS_TODAY };
}

/** The kinds a set holds (legend and footer name only those). */
export function weekQuestKindsOf(view: Pick<WeekQuestsView, "rows">): Set<WeekQuestKind> {
  return new Set(view.rows.map((r) => r.kind));
}

/** "Backtest" from "Backtest · 3 sessions × 45 min" (the label is never re-worded; this only trims the template's tail). */
export function practiceNameOf(label: string): string {
  const m = /^(.*) · \d+ (?:sessions?|days?) × \d+ min$/.exec(label);
  return m ? m[1] : label;
}

/** The progress of a row (the branded figure's value). */
export function weekQuestProgressOf(row: WeekQuestRow): number {
  return Number(row.figure.value);
}

/** The count line under or beside a row, always with its unit. */
export function weekQuestCountOf(row: WeekQuestRow): string {
  return weekQuestCountLine(row.kind, weekQuestProgressOf(row), row.count, row.unit, row.done);
}

/** The leading clause of a sentence ("Behind on new cards for Milestone 2"), up to its first colon. */
function leadClauseOf(line: string): string {
  const at = line.indexOf(":");
  return (at > 0 ? line.slice(0, at) : line).trim();
}

/**
 * The notes the roadmap variant shows: a sentence the page already shows
 * elsewhere (the QUESTS_BEHIND trigger's banner, worded like R6's note) is
 * rendered once, in the banner — matched exactly or by its leading clause.
 */
export function notesShownOf(notes: readonly string[], shownElsewhere: readonly string[]): string[] {
  const exact = new Set(shownElsewhere);
  const leads = new Set(shownElsewhere.filter((l) => l.includes(":")).map(leadClauseOf));
  return notes.filter((n) => !exact.has(n) && !(n.includes(":") && leads.has(leadClauseOf(n))));
}

/** The QUESTS_BEHIND banner's head and body: the sentence's own leading clause in bold, never repeated ("Behind on new cards for Milestone 2" + ": this week asks …"). */
export function behindBannerOf(line: string, ord: number): { head: string; body: string } {
  const at = line.indexOf(":");
  if (at > 0 && /^Behind on new cards/i.test(line)) {
    const body = line.slice(at + 1).trim();
    return { head: line.slice(0, at), body: body.charAt(0).toUpperCase() + body.slice(1) };
  }
  return { head: `Behind on new cards for Milestone ${ord}`, body: line };
}

/** "Add 5 cards to Risk Management, 2 of 5 cards added, counted by the app" (with a generator-2 row's parts: "…, 3 in Probability · 2 in Inference"). */
export function weekQuestAccessibleName(row: WeekQuestRow): string {
  const countLine = weekQuestCountOf(row);
  const added = row.kind === "ADD" && !row.done ? " added" : "";
  const where = row.place ? `. Shows it ${row.place}` : "";
  const parts = partsLineOf(row);
  return `${row.label}, ${countLine}${added}${parts ? `, ${parts}` : ""}, ${row.figure.caption}${where}`;
}

/**
 * A generator-2 row's parts line (R6's WeekQuestRowV2.partsLine, the
 * variant's own cut: Today and the Aim card the first two parts and "+n more
 * Domain(s)"); null on a v1 row, which renders as before.
 */
export function partsLineOf(row: WeekQuestRow): string | null {
  const line = row.partsLine;
  return typeof line === "string" && line.trim().length > 0 ? line : null;
}

/** A body plan's practice row carries HEALTH_LINE as its sub-line (R6's WeekQuestRow.health; the contract §15.11). */
export function rowHealthOf(row: WeekQuestRow): boolean {
  return row.kind === "PRACTICE" && row.health === true;
}

// ═══ Milestones list and strip (F18) ═════════════════════════════════════════

/**
 * The plan's milestone count as every surface reads it (the contract §11.2):
 * the server's RoadmapView.positions, else positionCountOf over the rows that
 * aren't LATER — a dropped milestone keeps its place, and a "Start again" copy
 * shares it. Now's "milestone 2 of 6", the Milestones list's count and the
 * rank ladder read this, so they agree with the Aim card, Today's chip and
 * Toward the aim.
 */
export function positionsOf(view: Pick<RoadmapView, "positions" | "milestones">): number {
  if (typeof view.positions === "number" && Number.isFinite(view.positions) && view.positions >= 0) return view.positions;
  return positionCountOf(view.milestones.filter((r) => r.state !== "LATER"));
}

/** The Milestones list's Paragon line: keyed on the rank's own top (maxScheduledPositionsOf over every version), never on a count of rows. */
export function paragonLineShown(rank: Pick<AimRankView, "top"> | null | undefined): boolean {
  return rank?.top.withAim === true;
}

const PLACE_STATE_ORDER: Readonly<Record<MilestoneRowView["state"], number>> = {
  REACHED: 0,
  PENDING_REACH: 1,
  CURRENT: 2,
  PAST_DUE: 3,
  SLIPPED: 4,
  CLOSED_UNREACHED: 5,
  PLANNED: 6,
  OUTLINE: 7,
  DROPPED: 8,
  LATER: 9,
};

/**
 * The "Milestones reached" strip, one segment per place (a lineage; a dropped
 * milestone and its "Start again" copy are one place, read from the live
 * row): on = reached, cur = the current one (ink outline), off otherwise;
 * never 'miss'. When the rows don't account for the count, the strip is
 * drawn from the count alone.
 */
export function milestoneSegmentsOf(rows: readonly (Pick<MilestoneRowView, "state"> & Partial<Pick<MilestoneRowView, "lineageId" | "ord">>)[], scheduled: number, reached: number): Segment[] {
  const placed = new Map<string, { state: MilestoneRowView["state"]; ord: number }>();
  rows.forEach((r, i) => {
    if (r.state === "LATER") return;
    const key = r.lineageId ?? `#${i}`;
    const prev = placed.get(key);
    if (!prev || PLACE_STATE_ORDER[r.state] < PLACE_STATE_ORDER[prev.state]) placed.set(key, { state: r.state, ord: r.ord ?? i });
  });
  const places = [...placed.values()].sort((a, b) => a.ord - b.ord);
  if (places.length === scheduled && scheduled > 0) {
    return places.map((p) => (p.state === "REACHED" ? "on" : p.state === "CURRENT" || p.state === "PENDING_REACH" || p.state === "PAST_DUE" ? "cur" : "off"));
  }
  return Array.from({ length: Math.max(0, scheduled) }, (_, i) => (i < reached ? "on" : i === reached ? "cur" : "off"));
}

/**
 * A dropped milestone offers [Start again] (F15, F22) on an open roadmap, once:
 * not when its lineage already has another live row (a copy planned, starting
 * or started; R4's startAgainCore refuses that too).
 */
export function startAgainOffered(r: Pick<MilestoneRowView, "id" | "lineageId" | "state">, rows: readonly Pick<MilestoneRowView, "id" | "lineageId" | "state">[], roadmapOpen: boolean): boolean {
  if (!roadmapOpen || r.state !== "DROPPED") return false;
  return !rows.some((x) => x.id !== r.id && x.lineageId === r.lineageId && x.state !== "DROPPED");
}

const FINISHED_ROW: ReadonlySet<MilestoneRowView["state"]> = new Set(["REACHED", "PENDING_REACH", "CLOSED_UNREACHED", "DROPPED", "PAST_DUE"]);

/**
 * The milestone an aftercare row came from (keepOnToday takes its id). The
 * row carries its milestone's id when the view has it; otherwise the one
 * finished row at that place (null when there isn't exactly one, so nothing
 * is written against a guess).
 */
export function aftercareMilestoneIdOf(r: { milestoneOrd: number; milestoneId?: string | null }, rows: readonly Pick<MilestoneRowView, "id" | "ord" | "state">[]): string | null {
  if (r.milestoneId) return r.milestoneId;
  const placed = rows.filter((x) => x.ord === r.milestoneOrd);
  const finished = placed.filter((x) => FINISHED_ROW.has(x.state));
  const at = finished.length > 0 ? finished : placed;
  return at.length === 1 ? at[0].id : null;
}

/** A milestone row's status line: "Reached 18 Dec · gave the Aim rank Aspirant", "Current · 21 Dec – 7 Mar" … */
export function milestoneRowLine(r: MilestoneRowView, today?: string): string {
  const win = r.windowStart && r.dueDay ? `${dayLabel(r.windowStart, today)} – ${dayLabel(r.dueDay, today)}` : "no dates";
  switch (r.state) {
    case "REACHED":
      return r.reachedDay ? `Reached ${dayLabel(r.reachedDay, today)}${r.gaveRank ? ` · gave the Aim rank ${r.gaveRank}` : ` · ${win}`}` : `Reached · ${win}`;
    case "PENDING_REACH":
      return r.countsFrom ? pendingReachLine(r.countsFrom) : "Reached · counts once your ticks settle";
    case "CURRENT":
      return `Current · ${win}`;
    case "PLANNED":
      return `Planned · ${win}`;
    case "OUTLINE":
      return `Outline · ${win}`;
    case "LATER":
      return "Later · no dates";
    case "DROPPED":
      return `Dropped · ${win}`;
    case "SLIPPED":
      return `Slipped · ${win}`;
    case "PAST_DUE":
      return r.dueDay ? `Past due · was due ${dayLabel(r.dueDay, today)}` : "Past due";
    case "CLOSED_UNREACHED":
      return closedUnreachedLine(r.closedPercent, r.rankIndex);
  }
}

// ═══ Runs: who wrote the rows on screen (F8, F9; the contract §9.1) ═══════════

/**
 * Who wrote the draft's rows: RunView.wrote (rowsWriterOf over every run,
 * newest first), never the latest run's own kind — that run may be CAPPED,
 * RUNNING or FAILED with nothing written. A view from before R4 fills `wrote`
 * falls back to the latest run alone (runWriterOf).
 */
export function draftRunWriterOf(run: RunView | null): RunWriter | null {
  if (!run) return null;
  if (run.wrote !== undefined) return run.wrote;
  return runWriterOf(run);
}

/** The banner above a draft: the cap (claims nothing about the rows), a failure that wrote the starter, or a failure that wrote nothing. */
export function draftBannerOf(run: RunView | null): string | null {
  if (!run) return null;
  const writer = draftRunWriterOf(run);
  if (run.capped === true || run.status === "CAPPED") return DRAFT_CAP_LINE;
  // The starter stands in Gemini's place: say why (a refused reply did answer; a rejected one has its own header line, RUN_REJECTED_LINE).
  if (run.status === "FAILED" && run.kind === "GEMINI") return writer === "STARTER" ? (/^reply refused\b/.test(run.error ?? "") ? RUN_REFUSED_LINE : RUN_STARTER_LINE) : writer ? RUN_UNFINISHED_LINE : null;
  return null;
}

/**
 * The run the living roadmap's "How this was drafted" describes (the
 * contract §11.2): RoadmapView.acceptedRun, the run behind the accepted plan
 * (null: no run wrote it, so no run is described). While a view doesn't carry
 * it, the latest run is shown under "Latest run", never "Drafted by": after a
 * re-plan or a CAPPED or FAILED attempt the latest run isn't the plan's.
 */
export function referenceRunOf(view: Pick<RoadmapView, "run" | "acceptedRun">): { run: RunView | null; label: string } {
  if (view.acceptedRun !== undefined) return { run: view.acceptedRun, label: DRAFTED_BY_LABEL };
  return { run: view.run, label: LATEST_RUN_LABEL };
}

/**
 * Whether a surface may name Gemini (Acceptance: with ROADMAP_GEMINI_LIVE
 * false or no key, no Gemini sentence appears anywhere): its path is live
 * with a key, or the rows on screen are the ones a Gemini run arranged
 * (provenance must still say so). A starter written in a failed run's
 * place, a plan from your numbers or one you wrote never names it.
 */
export function geminiNamedOf(live: boolean, run: RunView | null | undefined): boolean {
  return live || draftRunWriterOf(run ?? null) === "GEMINI";
}

/** Any live row of a draft still in Gemini's words (DRAFT or KEPT_SUGGESTION): a title, or an item not removed. */
export function draftHasGeminiWords(ms: readonly Pick<MilestoneDraft, "titleOrigin" | "titleDecision" | "items">[]): boolean {
  const gemini = (c: TextClass) => c === "DRAFT" || c === "KEPT_SUGGESTION";
  return ms.some((m) => gemini(provenanceOf(m.titleOrigin, m.titleDecision)) || m.items.some((it) => it.decision !== "REMOVED" && gemini(provenanceOf(it.origin, it.decision))));
}

// ═══ The aim check's figure ("Add a figure" on an ACTIVE roadmap) ═════════════

/** The figure sheet's two fields, checked as the intake checks them (R4's setAimFigureCore re-checks): a whole 1–5000 h, a source ≤ 120 characters. */
export function aimFigureOf(hours: string, source: string): { ok: true; hours: number; source: string | null } | { ok: false; field: "hours" | "source"; error: string } {
  const h = hours.trim();
  const n = Number(h);
  if (!h || !Number.isInteger(n) || n < TYPICAL_HOURS_MIN || n > TYPICAL_HOURS_MAX) return { ok: false, field: "hours", error: `A whole number of hours, ${TYPICAL_HOURS_MIN} to ${TYPICAL_HOURS_MAX}.` };
  const s = source.trim();
  if (Array.from(s).length > SOURCE_NOTE_MAX) return { ok: false, field: "source", error: `At most ${SOURCE_NOTE_MAX} characters.` };
  return { ok: true, hours: n, source: s || null };
}

// ═══ The Start sheet's pay line (F15; the contract §9.1 startStatedInputOf) ═══

/**
 * The stated MP for the sheet's current switches: statedForMilestone(
 * startStatedInputOf(payBasis, practices, off)) — the one arithmetic
 * finishStartCore freezes into goalMp, so the line the user sees when they
 * tap Start is the figure the goal states. A practice the server didn't size
 * (no weeklyMinutes) is sized from its item; with no payBasis the server's
 * line at the default switches stands.
 */
export function startPayOf(
  p: Pick<StartPreview, "pay" | "payBasis" | "practices">,
  off: Iterable<string>,
  items: readonly Pick<ItemDraft, "id" | "sessionsPerWeek" | "durationBand" | "method">[] = []
): { stated: number; zeroReason: StatedZeroReason | null; paidOn: DayKey | null } {
  if (!p.payBasis) return { stated: p.pay.stated, zeroReason: p.pay.zeroReason, paidOn: p.pay.paidOn ?? null };
  const practices = p.practices.map((x) => {
    if (typeof x.weeklyMinutes === "number" && Number.isFinite(x.weeklyMinutes)) return { lineageId: x.lineageId, weeklyMinutes: x.weeklyMinutes };
    const it = items.find((i) => i.id === x.itemId);
    return { lineageId: x.lineageId, weeklyMinutes: it ? practiceMinutesPerWeekOf(it) : 0 };
  });
  const s = statedForMilestone(startStatedInputOf(p.payBasis, practices, off));
  return { stated: s.stated, zeroReason: s.zeroReason, paidOn: s.paidOn ?? null };
}

// ═══ A typed target's verdict, on the device (F4 step 3; the server re-runs it) ═══

/**
 * A typed (YOURS) target against the engine's own figures for its measure:
 * ≤ expected FITS, ≤ best TIGHT, ≤ the strict floor OVER, above it IMPOSSIBLE.
 * A target equal to the fitted one stays FITTED (no verdict: it would be true
 * by construction).
 */
export function typedTargetVerdict(target: number, check: Pick<KnowledgeCheck, "expected" | "best" | "strictMax" | "fitted">): KnowledgeVerdict {
  if (check.fitted != null && target === check.fitted) return "FITTED";
  if (target > check.strictMax) return "IMPOSSIBLE";
  if (target > check.best) return "OVER";
  if (target > check.expected) return "TIGHT";
  return "FITS";
}

// ═══ Revision 4 (roadmap-rev4.md) ════════════════════════════════════════════

/**
 * Proficiency's label, always naming its basis (F-R4-12; Names): R1's
 * ProficiencyView.label ("Proficiency toward Mastered (level 12)"; the
 * contract §15.11) when the view carries it, else "Proficiency" (a plan with
 * no depth).
 */
export function proficiencyBasisLabelOf(p: ProficiencyView): string {
  const label = p.label;
  return typeof label === "string" && label.trim().length > 0 ? label : "Proficiency";
}

/** The basis alone, for the line under the eyebrow: "toward Mastered (level 12)"; null without one. */
export function proficiencyBasisOf(p: ProficiencyView): string | null {
  const label = proficiencyBasisLabelOf(p);
  return label.startsWith("Proficiency toward ") ? label.slice("Proficiency ".length) : null;
}

/**
 * Who chose a code-worded type (F-R4-18): Gemini's pick from the app's list
 * (ItemNote GEMINI_PICK), the app (a starter's pick, STUDY_ADDED or
 * PRODUCTION_ADDED), or you (an addition you made or a type you changed: its
 * decision EDITED). null: not a catalog item.
 */
export function catalogByOf(it: Pick<ItemDraft, "catalogKey" | "notes" | "origin" | "decision">): "GEMINI" | "APP" | "YOU" | null {
  if (!it.catalogKey) return null;
  if (it.notes.includes("GEMINI_PICK") && it.decision !== "EDITED") return "GEMINI";
  if (it.origin === "USER" || it.decision === "EDITED" || it.decision === "CHECKED") return "YOU";
  return "APP";
}

/** The notes a catalog row shows as its provenance words (so its note chips don't repeat them). */
export const CATALOG_PROVENANCE_NOTES: ReadonlySet<string> = new Set(["GEMINI_PICK", "STUDY_ADDED", "PRODUCTION_ADDED"]);

/** The slot of a catalog key (the provenance words name it: "practice type picked by Gemini…"). */
export function catalogSlotOf(key: CatalogKey | null | undefined): "PRACTICE" | "STEP" | "CHECKPOINT" | null {
  return key ? (catalogEntryOf(key)?.slot ?? null) : null;
}

/**
 * A revision-4 draft (F-R4-17): every row a revision-4 path wrote has a
 * stage, and a Field plan has a depth. Keys only: no Keep, no bulk keep, no
 * "I checked this" on Gemini's choices; what Gemini chose is labelled and
 * changeable instead.
 */
export function isKeysOnlyDraft(draft: Pick<DraftView, "milestones" | "depth">): boolean {
  return draft.depth != null || draft.milestones.some((m) => m.stage != null);
}

/** A stage held when you began (HELD_AT_START): no items, never started, gives no rank. */
export function isHeldMilestone(m: Pick<MilestoneDraft, "notes">): boolean {
  return m.notes.includes("HELD_AT_START");
}

/** Gemini's pending Domain additions are decided in the plan-level row, never on a milestone (F-R4-21). */
export function isPendingAddition(it: Pick<ItemDraft, "kind" | "origin" | "decision" | "notes">): boolean {
  return it.kind === "DOMAIN" && it.origin === "GEMINI" && it.decision === "PENDING" && it.notes.includes("NOT_CHOSEN");
}

/**
 * The date of a draft before and after the additions (F-R4-21): the plan's
 * realistic date now (its date check's D_real), and the latest date with
 * every addition chosen (the additions' own dates with them; the set's
 * effect is at least the worst single one).
 */
export function additionsDatesOf(draft: Pick<DraftView, "dateCheck" | "additions">, chosen: readonly string[]): { from: string | null; to: string | null } {
  const from = draft.dateCheck?.D_real ?? null;
  const picked = (draft.additions ?? []).filter((a) => chosen.includes(a.domainId) && a.dateWith);
  if (picked.length === 0) return { from, to: null };
  const to = picked.map((a) => a.dateWith as string).sort().pop() ?? null;
  return { from, to };
}

// ═══ The practice progression, as the plan shows it (contracts §20) ═════════
//
// Code owns every stage's practice on every plan path (roadmap-catalog
// progressionOf). The page never re-runs it: it reads what each stage holds
// and says, in code's words (roadmap-copy stageWhyPartsOf), what the stage
// trains (its focus: Gemini's pick among the stage's options, else the first
// practice the app placed), what it builds on from the stage before (the
// build-up rule's carry), and what closes it (the exam, a mock test, the
// full attempt, the performance check). Gemini's pick on a v4 plan is
// labelled as its choice among the stage's options (progressionCandidatesOf),
// with how many there were and the app's default.

/** The first prompt version whose reply picks at most one practice per stage among code's options (ROADMAP_PROMPT_VERSION 4, contracts §20). */
export const PROGRESSION_PROMPT_VERSION = 4;

/**
 * Gemini's picks on the rows a run wrote are choices among each stage's
 * options (contracts §20): every run but one from before the progression
 * (promptVersion 3 or below: that reply chose every practice, step and
 * checkpoint type from the app's whole list). No run, or no version: true.
 */
export function picksAreChoicesOf(run: Pick<RunView, "promptVersion"> | null | undefined): boolean {
  return !(run && typeof run.promptVersion === "number" && run.promptVersion < PROGRESSION_PROMPT_VERSION);
}

/**
 * The rows a run wrote are code's progression (contracts §20): the app wrote
 * them (its starter, a re-fit, a rejected reply's stand-in) or a Gemini reply
 * from the progression on did. Only a v3 reply's rows, whose every type
 * Gemini chose itself, are not: they get no "why this stage" line.
 */
export function rowsAreProgressionOf(run: RunView | null): boolean {
  return draftRunWriterOf(run) !== "GEMINI" || picksAreChoicesOf(run);
}

/**
 * What the progression reads of a plan: its catalog track, whether there is
 * an exam, a Field plan's practice family (contracts §20.11: which table its
 * stages' options come from; absent: KNOW, as the catalog reads it), and the
 * kinds its gate holds (`blocked`: the activity card's PENDING and AVOID
 * rows, activityBlockedOf; no plan path places one, and Gemini's v4 enum
 * never offered one). Absent `blocked`: nothing held.
 */
export interface StageRun {
  track: CatalogTrack;
  exam: boolean;
  family?: PracticeFamily | null;
  blocked?: readonly CatalogKey[];
}

/**
 * A plan's StageRun from its Area and exam (the editor's scope or the
 * header): catalogTrackOf, and examLabel set. A Field plan's family is the
 * catalog's reading (practiceFamilyOf): the user's answer when the view
 * carries it (`practiceFamily`), else code's reading of the aim and the
 * exam's name, the same prefill the server reads when no answer was given.
 * With the scope's `excluded` (pickerExcludedOf: what the gate holds) less
 * what the user allowed back (`allowed`, an older server's [Allow one]), the
 * gate's blocked kinds: the same kinds the type picker leaves out.
 */
export function stageRunOf(p: {
  areaFieldId: string | null;
  track: Track;
  examLabel: string | null;
  aim?: string | null;
  practiceFamily?: unknown;
  excluded?: readonly CatalogKey[] | null;
  allowed?: readonly CatalogKey[] | null;
}): StageRun {
  const allowed = new Set<string>(p.allowed ?? []);
  const blocked = (p.excluded ?? []).filter((k) => !allowed.has(k));
  const track = catalogTrackOf({ fieldId: p.areaFieldId, track: p.track });
  const family = track === "FIELD" ? practiceFamilyOf({ aim: p.aim ?? "", examLabel: p.examLabel, practiceFamily: p.practiceFamily }) : null;
  return { track, exam: p.examLabel != null && p.examLabel.trim().length > 0, ...(family ? { family } : {}), ...(blocked.length > 0 ? { blocked } : {}) };
}

/** A stage's level as its paying card measure states it (a gate's, BETWEEN's odd level, PART's gate level); null without one. */
export function stageLevelOf(m: Pick<MilestoneDraft, "measures">): number | null {
  return m.measures.find((x) => x.kind === "CARDS_AT_LEVEL" && x.role === "PAYS" && typeof x.minLevel === "number")?.minLevel ?? null;
}

/**
 * The practice types a stage offers as its focus, code's default first
 * (roadmap-catalog progressionCandidatesOf over the stage key and level, the
 * plan's family's table on a Field plan, through the exam filter and the
 * plan's gate, `run.blocked`): the options
 * the v4 enum offered Gemini for that stage (a BETWEEN's or PART's are its
 * gate's), the first being code's default under the gate (a held default
 * gives way to the next placeable candidate, as progressionOf places it).
 * A kind the gate holds is never an option and never "the app's default".
 * [] without a stage (a rev-3 row).
 */
export function stageOptionsOf(m: Pick<MilestoneDraft, "stage" | "measures">, run: StageRun): PracticeKind[] {
  if (!m.stage) return [];
  return progressionCandidatesOf(run.track, { stage: m.stage, level: stageLevelOf(m) }, { exam: run.exam, practicesAllowed: true, family: run.family ?? null, gate: { blocked: [...(run.blocked ?? [])] } });
}

/** Gemini's pick on a practice row, as a choice among its stage's options: the options in order (the app's default first), and whether it is the default. */
export interface GeminiChoice {
  kind: PracticeKind;
  options: readonly PracticeKind[];
  isDefault: boolean;
}

/**
 * A row's Gemini choice (contracts §20.5): a practice Gemini picked (it still
 * reads GEMINI_PICK, catalogByOf GEMINI) on a plan whose picks are choices
 * (picksAreChoicesOf), whose type is one of its stage's options under the
 * plan's gate (stageOptionsOf with `run.blocked`). null for anything else:
 * the app's or the user's type, a step or a checkpoint, a v3 pick, or a type
 * off the stage's list (one the gate now holds included).
 */
export function geminiChoiceOf(
  it: Pick<ItemDraft, "kind" | "catalogKey" | "notes" | "origin" | "decision">,
  m: Pick<MilestoneDraft, "stage" | "measures">,
  run: StageRun & { choices: boolean }
): GeminiChoice | null {
  if (!run.choices || it.kind !== "PRACTICE" || catalogByOf(it) !== "GEMINI") return null;
  const options = stageOptionsOf(m, run);
  const kind = options.find((k) => k === it.catalogKey);
  return kind ? { kind, options, isDefault: options[0] === kind } : null;
}

/**
 * Gemini's choices accept still waits on (R4's DECIDE_PRACTICE_PICKS, which
 * blocks a pending pick that isn't code's default on every track): practice
 * rows still Gemini's choice and still PENDING, not the stage's default, in a
 * milestone that isn't Later, in plan order. A BODY or CARE plan whose picks
 * need the one session confirm decides them in that card instead
 * (DraftView.sessionPicks), so the caller leaves those out.
 */
export function pendingChoicesOf(milestones: readonly MilestoneDraft[], run: StageRun & { choices: boolean }): EditorRow[] {
  return [...milestones]
    .filter((m) => m.status !== "LATER")
    .sort((a, b) => a.ord - b.ord)
    .flatMap((m) =>
      [...m.items]
        .sort((a, b) => a.ord - b.ord)
        .filter((it) => it.decision === "PENDING")
        .filter((it) => {
          const c = geminiChoiceOf(it, m, run);
          return c != null && !c.isDefault;
        })
        .map(editorRowOf)
    );
}

/**
 * A practice that takes turns with another, week about (contracts §20.12;
 * the lead's ruling 1: where a stage's room holds one practice and its role
 * needs two kinds, they alternate rather than each thinning to one session a
 * week): the kind it alternates with, read from the row's own code words
 * (roadmap-catalog practiceTurnOfLabel: "Problem sets one week, timed
 * practice the next: …"). null for any other row: a step, a removed row, a
 * type with no turn, words that no longer say so.
 */
export function practiceTurnOf(it: Pick<ItemDraft, "kind" | "catalogKey" | "label" | "decision">): PracticeKind | null {
  if (it.kind !== "PRACTICE" || it.decision === "REMOVED" || !it.catalogKey) return null;
  return practiceTurnOfLabel(it.catalogKey, it.label);
}

/** The rows were written by you ("Write it myself", or a re-plan edited by hand): RunView.wrote MANUAL. */
export function rowsAreManualOf(run: RunView | null): boolean {
  return draftRunWriterOf(run) === "MANUAL";
}

/**
 * "Add the app's practice" on a stage of a plan you wrote yourself (the
 * lead's ruling 6: a re-fit never fills a manual plan's practices; the stage
 * offers code's one tap instead, R4's addAppPractice: the progression's
 * practices for that stage, its focus first). Offered while the stage lacks
 * its own default under the plan's gate and family (stageOptionsOf's first:
 * the kind code's progression trains there, the role-defining one), which
 * names it. null when there is nothing to add: no stage, every option held by
 * the gate, the stage already holding that kind or you having removed it
 * there (the app never puts back a kind you took out of a stage), or its
 * practices full.
 */
export function appPracticeOf(m: Pick<MilestoneDraft, "stage" | "measures" | "items">, run: StageRun): PracticeKind | null {
  const practices = m.items.filter((it) => it.kind === "PRACTICE");
  if (practices.filter((it) => it.decision !== "REMOVED").length >= PRACTICES_PER_MILESTONE) return null;
  const kind = stageOptionsOf(m, run)[0] ?? null;
  return kind && !practices.some((it) => it.catalogKey === kind) ? kind : null;
}

/** What closes a stage (roadmap-copy StageEnd), in this order when a stage holds more than one. */
export type { StageEnd };
const STAGE_ENDS: readonly StageEnd[] = ["EXAM_DAY", "MOCK_TEST", "FULL_ATTEMPT", "PERFORMANCE_CHECK"];

/** Why a stage holds what it practises (roadmap-copy stageWhyPartsOf words it). */
export interface StageWhy {
  /** The kind the stage trains: its focus. */
  focus: PracticeKind | null;
  /** How demanding the focus is on the track (PROGRESSION's rung); null off the track's table. */
  rung: ProgressionRung | null;
  /** The stage before's focus this stage keeps (the build-up rule's carry), with that milestone's number; `same`: this stage trains it again. */
  carry: { kind: PracticeKind; ord: number; same: boolean } | null;
  /** What closes the stage: the exam, a mock test, the full attempt or the performance check. */
  end: StageEnd | null;
}

/** A row the progression placed and the user hasn't removed: a catalog type, live. */
function liveCatalogItems(m: Pick<MilestoneDraft, "items">): ItemDraft[] {
  return m.items.filter((it) => it.decision !== "REMOVED" && (isCatalogKey(it.catalogKey) || (it.kind === "CHECKPOINT" && it.checkpointKind != null))).sort((a, b) => a.ord - b.ord);
}

/**
 * A stage's focus, read from what it holds: the first practice it holds (the
 * progression lists code's default focus first, a stand-in, a copy's gate's
 * and a carried stage's kinds included; Gemini's pick sits beside it, never
 * in its place). Never timed practice (the exam's extra) or a type off the
 * track; one you removed is gone, so the next practice reads as the focus.
 */
function stageFocusOf(m: Pick<MilestoneDraft, "items">, run: StageRun): PracticeKind | null {
  const practices = liveCatalogItems(m).filter((it) => {
    const e = it.kind === "PRACTICE" ? catalogEntryOf(it.catalogKey) : null;
    return e != null && e.slot === "PRACTICE" && !e.examOnly && e.tracks.includes(run.track);
  });
  return (practices[0]?.catalogKey as PracticeKind | undefined) ?? null;
}

/** What closes a stage: its live exam, mock test, full attempt or performance check (STAGE_ENDS order). */
function stageEndOf(m: Pick<MilestoneDraft, "items">): StageEnd | null {
  const keys = new Set<string>(liveCatalogItems(m).map((it) => (it.catalogKey ?? it.checkpointKind) as string));
  return STAGE_ENDS.find((k) => keys.has(k)) ?? null;
}

/**
 * Each stage's why, by lineage (contracts §20): its focus and the focus's
 * rung, the stage before's focus it keeps (carry, or `same` when it trains
 * it again), and what closes it. Read in order of the milestone number; a
 * held stage gets none and is never "the stage before". A stage with no
 * practice (practices off) has no focus and breaks no chain: the next one
 * builds on the last stage that had one.
 */
export function stageWhysOf(milestones: readonly MilestoneDraft[], run: StageRun): Map<string, StageWhy> {
  const out = new Map<string, StageWhy>();
  let prev: { kind: PracticeKind; ord: number } | null = null;
  for (const m of [...milestones].sort((a, b) => a.ord - b.ord)) {
    if (isHeldMilestone(m)) continue;
    const focus = stageFocusOf(m, run);
    const holds = new Set<string>(liveCatalogItems(m).filter((it) => it.kind === "PRACTICE").map((it) => it.catalogKey as string));
    const carry = prev && focus && holds.has(prev.kind) ? { kind: prev.kind, ord: prev.ord, same: prev.kind === focus } : null;
    out.set(m.lineageId, { focus, rung: focus ? (PROGRESSION[run.track].rung[focus] ?? null) : null, carry, end: stageEndOf(m) });
    if (focus) prev = { kind: focus, ord: m.ord };
  }
  return out;
}

/**
 * What a keys-only v4 Gemini draft's reply decided, read from the rows it
 * left (contracts §20). The draft header (roadmap-copy geminiV4LeadLine) and
 * the arrangement line (arrangementV4Line) name only these parts, never one
 * the run didn't ask (a track Area asks no Domains and no order; a plan
 * without an outline, no order; practices off, no pick) or the reply left
 * to the app (a slot with no pick keeps code's default):
 *   needs   Gemini suggested another Domain: a NOT_CHOSEN Domain row it
 *           wrote, still waiting or decided (Add or Leave out keep the row)
 *   order   a Field run with an outline: MOVED when the lines Gemini placed
 *           sit out of your order, KEPT when your order stands (Gemini gave
 *           yours back, or left the order to the app); null with no outline.
 *           A line you moved yourself (EDITED) is yours and isn't read.
 *   picks   practice rows still Gemini's choice (catalogByOf GEMINI, not
 *           removed; BETWEEN's and PART's copies included, as the page labels
 *           each); `picked`: any row Gemini picked, one you changed or removed
 *           included, so a plan whose every pick you changed never reads "the
 *           app chose every practice"
 *   field   a Field Area: the names come from the aim, the outline and the
 *           Domains; a track Area's from the aim alone
 */
export interface GeminiV4Parts {
  needs: boolean;
  order: "MOVED" | "KEPT" | null;
  picks: number;
  picked: boolean;
  field: boolean;
}

export function geminiV4PartsOf(milestones: readonly Pick<MilestoneDraft, "ord" | "items">[], opts: { field: boolean }): GeminiV4Parts {
  const items = [...milestones].sort((a, b) => a.ord - b.ord).flatMap((m) => [...m.items].sort((a, b) => a.ord - b.ord));
  const needs = opts.field && items.some((it) => it.kind === "DOMAIN" && it.origin === "GEMINI" && it.notes.includes("NOT_CHOSEN"));
  const lines = opts.field ? items.filter((it) => it.kind === "TOPIC" && it.origin === "SYLLABUS" && typeof it.syllabusRef === "number") : [];
  const placed = lines.filter((it) => it.decision !== "EDITED").map((it) => it.syllabusRef as number);
  const order = lines.length === 0 ? null : placed.every((r, i) => i === 0 || r > placed[i - 1]) ? "KEPT" : "MOVED";
  const pickRows = items.filter((it) => it.kind === "PRACTICE" && it.notes.includes("GEMINI_PICK"));
  const picks = pickRows.filter((it) => it.decision !== "REMOVED" && catalogByOf(it) === "GEMINI").length;
  return { needs, order, picks, picked: pickRows.length > 0, field: opts.field };
}

/**
 * What "Draft with Gemini" would ask (contracts §20.5: the v4 schema's parts
 * as the pack and keysOnlySchemaOf issue them), from the form as it stands:
 *   lines   the outline lines Gemini would put in order (a Field Area; 0: no
 *           `order`)
 *   needs   which other Domains the aim may need (a Field Area with a Domain
 *           of the Area not in the plan, while the plan's Domains leave the
 *           pack room for one: PACK_MAX_DOMAINS)
 *   picks   one practice per stage among the app's options (practices on;
 *           always on a life-track Area)
 * null: nothing for Gemini to decide (a Field Area with practices off, no
 * outline and every Domain of the Area in the plan): the v4 schema would have
 * no property, so the form offers only "Build from my numbers" and says why.
 */
export interface GeminiAsks {
  lines: number;
  needs: boolean;
  picks: boolean;
}

export function geminiAsksOf(p: { fieldArea: boolean; lines: number; otherDomains: number; chosenDomains: number; practicesAllowed: boolean }): GeminiAsks | null {
  const lines = p.fieldArea && Number.isFinite(p.lines) ? Math.max(0, Math.floor(p.lines)) : 0;
  const needs = p.fieldArea && p.otherDomains > 0 && p.chosenDomains < PACK_MAX_DOMAINS;
  const picks = !p.fieldArea || p.practicesAllowed;
  return lines > 0 || needs || picks ? { lines, needs, picks } : null;
}

/// ═══ Constraint safety: confirm to unlock (contracts §19) ════════════════════
//
// The confirm card reads the gate's view (DraftView.activityConfirm,
// RoadmapView.activityConfirm; roadmap-catalog activityConfirmViewOf). The
// boxes are ticked "avoid"; the parser's reading only pre-ticks a box (a
// suggestion: it never blocks and never unlocks anything). Answering is an
// explicit act (the lead's decision 1): Save with at least one box ticked, or
// "Nothing to avoid". Either sends the card's answer (ActivityCardAnswer)
// with the key of the words the card was shown against, so an answer given
// while the words changed elsewhere is refused and the card asks again
// (decision 3). An unticked row is never sent as "fine", and Save with
// nothing ticked is never offered.

/** The card to show, or null: off with no rows (a plan with nothing to ask and nothing answered). */
export function activityCardOf(v: ActivityConfirmView | null | undefined): ActivityConfirmView | null {
  if (!v || !Array.isArray(v.rows)) return null;
  return v.on || v.rows.length > 0 ? v : null;
}

/** The card asks (its list opens by itself, and the plan holds kinds meanwhile): the gate is on and rows wait on the user's answer. */
export function activityAsksOf(v: Pick<ActivityConfirmView, "on" | "pending"> | null | undefined): boolean {
  return Boolean(v && v.on && v.pending > 0);
}

/** Unanswered suggestions (WORDS rows: the user's words name a kind the plan still places): the list opens too, though nothing waits on it (decision 7). */
export function activitySuggestsOf(v: Pick<ActivityConfirmView, "rows"> | null | undefined): boolean {
  return Boolean(v && Array.isArray(v.rows) && v.rows.some((r) => r.state === "WORDS"));
}

/** The card's list is open by itself: it asks, or it carries suggestions to answer. Otherwise it shows the answer, with [Change]. */
export function activityOpenOf(v: Pick<ActivityConfirmView, "on" | "pending" | "rows"> | null | undefined): boolean {
  return activityAsksOf(v) || activitySuggestsOf(v);
}

/**
 * The boxes ticked "avoid" when the list opens, in row order: the user's own
 * AVOIDs, and a suggestion (the parser's reading of the user's words) on a
 * row still to answer, PENDING or WORDS. Never a row the card's answer left
 * unticked (FINE), and never a plain pending row.
 */
export function activityAvoidOf(rows: readonly Pick<ActivityRow, "kind" | "state" | "prefill">[]): CatalogKey[] {
  return rows.filter((r) => r.state === "AVOID" || r.state === "WORDS" || (r.state === "PENDING" && r.prefill === "AVOID")).map((r) => r.kind);
}

/**
 * What Save sends (contracts §19.3): the view's key and every box ticked
 * "avoid" on the card's rows, in row order (CATALOG order); never a reason
 * (the server quotes the user's words). Null when nothing is ticked: Save is
 * then not offered, and the card's button is "Nothing to avoid".
 */
export function activityCardAnswerOf(view: Pick<ActivityConfirmView, "key" | "rows">, avoid: Iterable<CatalogKey>): ActivityCardAnswer | null {
  const ticked = new Set<CatalogKey>(avoid);
  const kinds = view.rows.filter((r) => ticked.has(r.kind)).map((r) => r.kind);
  return kinds.length > 0 ? { key: view.key, avoid: kinds, nothingToAvoid: false } : null;
}

/** "Nothing to avoid" (ACTIVITY_NOTHING_TO_AVOID): the explicit all-clear over the rows shown, with the view's key. */
export function activityNothingToAvoidOf(view: Pick<ActivityConfirmView, "key">): ActivityCardAnswer {
  return { key: view.key, avoid: [], nothingToAvoid: true };
}

/** The kinds no plan path places now (a shown PENDING or AVOID row): the type picker leaves them out. A suggestion (WORDS) is placed, so it is offered. */
export function activityBlockedOf(v: Pick<ActivityConfirmView, "rows"> | null | undefined): CatalogKey[] {
  return (v?.rows ?? []).filter((r) => r.state === "PENDING" || r.state === "AVOID").map((r) => r.kind);
}

/**
 * The type picker's left-out kinds: with the gate's view, what the gate
 * holds (PENDING and AVOID; the parser's exclusions are suggestions and
 * never block). Without it (an older server), the exclusions alone.
 */
export function pickerExcludedOf(v: Pick<ActivityConfirmView, "rows"> | null | undefined, exclusions: readonly { kind: CatalogKey }[] | null | undefined): CatalogKey[] {
  if (!v) return (exclusions ?? []).map((x) => x.kind);
  return activityBlockedOf(v);
}

/** The kinds waiting on the user's answer (PENDING rows). */
export function activityWaitingOf(v: Pick<ActivityConfirmView, "rows"> | null | undefined): CatalogKey[] {
  return (v?.rows ?? []).filter((r) => r.state === "PENDING").map((r) => r.kind);
}

/**
 * A milestone's practices, steps and checkpoint the answer holds back (the
 * Start sheet; R4's Start creates no task for one): waiting on it (a PENDING
 * row's kind) or one the user said to avoid (an AVOID row's). A suggestion
 * never holds one back. An item with no catalog type is the user's own words
 * and is never held.
 */
export function heldPracticesOf(m: Pick<MilestoneDraft, "items">, v: Pick<ActivityConfirmView, "rows"> | null | undefined): { waiting: ItemDraft[]; leftOut: ItemDraft[] } {
  const stateOf = new Map((v?.rows ?? []).map((r) => [r.kind as string, r.state] as const));
  const practices = m.items.filter((it) => (it.kind === "PRACTICE" || it.kind === "STEP" || it.kind === "CHECKPOINT") && it.decision !== "REMOVED" && isCatalogKey(it.catalogKey));
  return {
    waiting: practices.filter((it) => stateOf.get(it.catalogKey as string) === "PENDING"),
    leftOut: practices.filter((it) => stateOf.get(it.catalogKey as string) === "AVOID"),
  };
}

/**
 * The practices Gemini's session picks give way to (the server's EASY swap,
 * confirmSessionPicks): the track's safe practices (cueSafeKindsOf, practice
 * slot only), less any the user said to avoid (an AVOID row). Easy, mobility
 * and technique on a body plan; Plan the week ahead and Keep a log on a care
 * plan. The swap's button and its line name these, never another track's.
 */
export function sessionSwapKindsOf(track: CatalogTrack, confirm: Pick<ActivityConfirmView, "rows"> | null | undefined): CatalogKey[] {
  const avoided = new Set<string>((confirm?.rows ?? []).filter((r) => r.state === "AVOID").map((r) => r.kind));
  return cueSafeKindsOf(track).filter((k) => catalogEntryOf(k)?.slot === "PRACTICE" && !avoided.has(k));
}

/** The plan's line while rows wait ("Easy, mobility and technique practice only until you confirm."); null when nothing waits. */
export function practiceOnlyLineOf(v: Pick<ActivityConfirmView, "on" | "pending" | "safeKinds"> | null | undefined): string | null {
  return v && activityAsksOf(v) ? activityPendingLine(v.safeKinds) : null;
}

/**
 * The rows as the answer would leave them (the intake's card once confirmed
 * on the form, before it is saved): each ticked row AVOID, every other
 * listed row placed (FINE), with no day yet. The summary reads them.
 */
export function rowsAnsweredBy(rows: readonly ActivityRow[], answer: Pick<ActivityCardAnswer, "avoid">): ActivityRow[] {
  const ticked = new Set<string>(answer.avoid);
  return rows.map((r) => (ticked.has(r.kind) ? { ...r, state: "AVOID" as const, day: r.state === "AVOID" ? r.day : null, staleDay: null, cls: "YOURS" as const } : { ...r, state: "FINE" as const, day: null, staleDay: null, cls: "YOURS" as const }));
}

/** What the intake's card reads: the form's would-be texts and Area, and an open draft's stored answers. */
export interface IntakeActivityInput {
  track: CatalogTrack;
  texts: CueTexts;
  exam: boolean;
  practicesAllowed: boolean;
  /** The examLabel the parser fills labels with (the server's fill). */
  examLabel: string | null;
  stored: ActivityConfirm | null | undefined;
}

/**
 * The intake's confirm card (the gate run on the form as typed, pure): the
 * parser's exclusions over the track's offered kinds as the server reads
 * them (suggestions only), the stored answers of an open draft, and the key
 * the answer is given against. A parser failure suggests nothing.
 */
export function intakeActivityOf(input: IntakeActivityInput): { view: ActivityConfirmView; key: string } {
  const filter = { track: input.track, exam: input.exam, practicesAllowed: input.practicesAllowed };
  let exclusions: ReturnType<typeof constraintExclusionsOf> = [];
  if (input.texts.constraints && input.texts.constraints.trim()) {
    try {
      const kinds = [...catalogKindsFor("PRACTICE", filter), ...catalogKindsFor("STEP", filter), ...catalogKindsFor("CHECKPOINT", filter)];
      exclusions = constraintExclusionsOf(input.texts.constraints, kinds, { track: input.track, domains: [], aim: input.texts.aim, exam: input.examLabel });
    } catch {
      exclusions = [];
    }
  }
  const state = constraintsStateOf({ track: input.track, texts: input.texts, exam: input.exam, practicesAllowed: input.practicesAllowed, exclusions });
  const gate = allowedKindsFor(state, input.stored ?? null);
  return { view: activityConfirmViewOf(state, gate), key: state.key };
}

/**
 * The aim-conflict line (the lead's decision 6), or null. It quotes the
 * user's own sentence holding the word (userClauseOf over their
 * constraints; nothing to quote, no line: never a "no X" built from it), and
 * shows only while the conflict is unresolved:
 *   - with the activity card on screen, until the card is answered under
 *     these words (ActivityConfirmView.answered);
 *   - with the gate's view but no card (nothing to ask), always (nothing is
 *     left out: the line only points at the clash);
 *   - without the gate's view (an older draft), while a kind the
 *     constraints name is still left out (`leftOut`).
 */
export function aimConflictLineOf(input: {
  /** R3's aimConflictOf: the word, and (since the safety-gaps round) `quote`, the user's clause holding it. */
  conflict: { word: string; quote?: string } | null | undefined;
  constraints: string | null | undefined;
  aim: string;
  confirm: ActivityConfirmView | null | undefined;
  leftOut: number;
}): string | null {
  const word = input.conflict?.word;
  if (typeof word !== "string" || !word.trim()) return null;
  // R3's quote when it is the user's own text, verbatim and short enough to quote; else the clause found here.
  const quote = typeof input.conflict?.quote === "string" ? input.conflict.quote.trim() : "";
  const verbatim = quote.length > 0 && quote.length <= ACTIVITY_REASON_MAX && typeof input.constraints === "string" && input.constraints.includes(quote);
  const sentence = verbatim ? quote : userClauseOf(input.constraints, word);
  if (!sentence) return null;
  const card = activityCardOf(input.confirm);
  if (card) return card.answered == null ? aimConflictLine(sentence, input.aim, true) : null;
  if (input.confirm) return aimConflictLine(sentence, input.aim, false);
  return input.leftOut > 0 ? aimConflictLine(sentence, input.aim, false) : null;
}

/** A started practice an answer took off Today (decision 4; R4's PausedTask): its template, and the title Today shows. */
export interface PausedTemplate {
  templateId: string;
  title: string;
}

/** At most this many tasks are named in one notice. */
const PAUSED_MAX = 20;

/** One list of R4's reply, read defensively (own property; each entry a template id and a title; deduped). */
function pausedListOf(reply: unknown, field: "paused" | "notPaused"): PausedTemplate[] {
  if (!reply || typeof reply !== "object" || !Object.prototype.hasOwnProperty.call(reply, field)) return [];
  const list = (reply as Record<string, unknown>)[field];
  if (!Array.isArray(list)) return [];
  const out: PausedTemplate[] = [];
  for (const x of list.slice(0, PAUSED_MAX)) {
    if (!x || typeof x !== "object") continue;
    const { templateId, title } = x as { templateId?: unknown; title?: unknown };
    if (typeof templateId === "string" && templateId.trim() && typeof title === "string" && title.trim() && !out.some((p) => p.templateId === templateId)) out.push({ templateId, title: title.trim() });
  }
  return out;
}

/**
 * The started practices the answer took off Today (the lead's decision 4:
 * R4's setActivityVerdicts reply, ActivityVerdictsResult.paused, archived
 * through the existing path with their history kept). [] from a reply that
 * carries none (an older server, a draft, an answer that avoids nothing
 * started). The notice's Undo is the existing unarchiveTask, one per task.
 */
export function pausedOfReply(reply: unknown): PausedTemplate[] {
  return pausedListOf(reply, "paused");
}

/** Those R4 couldn't take off Today (ActivityVerdictsResult.notPaused): still live there, so the notice names them and says where to archive them. */
export function notPausedOfReply(reply: unknown): PausedTemplate[] {
  return pausedListOf(reply, "notPaused");
}

/**
 * What this page saw happen to a started item's Today task, keyed by its
 * template (roadmap-pauses: the save's reply and the notice's Undo, in this
 * tab): taken off Today (R4's `paused`), refused or failed (`notPaused`:
 * still on Today), or brought back by Undo. The view carries no task state
 * yet, so a task the page saw nothing happen to reads as the answer left it.
 */
export type TaskSeen = "PAUSED" | "NOT_PAUSED" | "UNDONE";

/**
 * How a started practice or step stands after the user's answer (the lead's
 * ruling 3: never a silent change to the milestone):
 *   - PAUSED      the AVOID stands and its task is off Today;
 *   - NOT_PAUSED  the AVOID stands, but its task couldn't be taken off Today
 *                 (R4's `notPaused`): still there, so the row says so and why,
 *                 and keeps its On Today link;
 *   - UNDONE      the AVOID stands, and the user brought the task back with
 *                 the notice's Undo: on Today again, link kept;
 *   - LIFTED      no AVOID stands any more (the user changed the answer, or
 *                 the row asks again), but its Practice kept stopped paying
 *                 when one did: R4 never turns it back (the days it was
 *                 paused would count against the user), so the row and the
 *                 measure still say it no longer counts.
 */
export type PauseState = "PAUSED" | "NOT_PAUSED" | "UNDONE" | "LIFTED";

/** A started practice or step of the current milestone an answer touched: its lineage and task, its row's words, its state and the day. */
export interface PausedItem {
  lineageId: string;
  templateId: string;
  kind: "PRACTICE" | "STEP";
  label: string;
  /** The AVOID's day: the pause is immediate, a must included (the lead's ruling 2). Null once LIFTED (the card no longer holds it). */
  day: DayKey | null;
  /**
   * A practice whose own Practice kept measure no longer pays (role CONTEXT:
   * R4's offTargetOpsOf, the lead's ruling 3): from `day` it no longer counts
   * toward the milestone. False for a step, and for a practice whose measure
   * still pays (it shares one with a practice the user didn't avoid, or R4
   * left it paying).
   */
  offTarget: boolean;
  state: PauseState;
  /** Its task is known to be off Today (PAUSED, or LIFTED after this page saw it paused): the row shows no On Today link. */
  offToday: boolean;
}

/** The task ids a Practice kept measure counts (its key's `t:`); [] for another measure. */
function keptTemplatesOf(measureKey: string): string[] {
  const p = parseMeasureKey(measureKey);
  return p?.kind === "PRACTICE_KEPT" ? p.templateIds : [];
}

/**
 * The current milestone's practices and steps an answer touched (decision
 * 4, ruling 3), shown on the roadmap page so the milestone never changes
 * silently. Read from the view as R4 leaves it, and from what this page saw
 * (`seen`, roadmap-pauses):
 *   - an item Start put on Today (its templateId) whose type the user said to
 *     avoid on or after the milestone's start day (an AVOID row and its day):
 *     PAUSED, unless this page saw its pause refused (NOT_PAUSED) or undone
 *     (UNDONE);
 *   - a started practice whose own Practice kept turned CONTEXT while no
 *     AVOID stands for its type any more: LIFTED.
 * A practice is `offTarget` when its Practice kept measure is CONTEXT. An
 * AVOID given before Start never reaches Today (Start holds the kind back),
 * so it is no pause. [] before Start, without the gate's view, or with
 * nothing avoided; a finished step (stepDone) is never called paused.
 */
export function pausedItemsOf(
  current: Pick<CurrentMilestoneView, "milestone" | "measures" | "startedDay" | "stepDone"> | null | undefined,
  confirm: Pick<ActivityConfirmView, "rows"> | null | undefined,
  seen?: ReadonlyMap<string, TaskSeen> | null
): PausedItem[] {
  const from = current?.startedDay ?? null;
  if (!current || !from || !confirm || !Array.isArray(confirm.rows)) return [];
  const avoidedOn = new Map<string, DayKey>();
  const avoided = new Set<string>();
  for (const r of confirm.rows) {
    if (r.state !== "AVOID") continue;
    avoided.add(r.kind);
    if (typeof r.day === "string" && r.day >= from) avoidedOn.set(r.kind, r.day);
  }
  const context = new Set((current.measures ?? []).filter((x) => x.kind === "PRACTICE_KEPT" && x.role === "CONTEXT").flatMap((x) => keptTemplatesOf(x.measureKey)));
  const out: PausedItem[] = [];
  for (const it of [...current.milestone.items].sort((a, b) => a.ord - b.ord)) {
    if ((it.kind !== "PRACTICE" && it.kind !== "STEP") || it.decision === "REMOVED" || !it.templateId || !isCatalogKey(it.catalogKey)) continue;
    if (it.kind === "STEP" && current.stepDone?.[it.lineageId]) continue;
    const offTarget = it.kind === "PRACTICE" && context.has(it.templateId);
    const saw = seen?.get(it.templateId);
    const day = avoidedOn.get(it.catalogKey) ?? null;
    let state: PauseState;
    if (day) state = saw === "NOT_PAUSED" ? "NOT_PAUSED" : saw === "UNDONE" ? "UNDONE" : "PAUSED";
    else if (offTarget && !avoided.has(it.catalogKey)) state = "LIFTED";
    else continue;
    out.push({ lineageId: it.lineageId, templateId: it.templateId, kind: it.kind, label: it.label, day, offTarget, state, offToday: state === "PAUSED" || (state === "LIFTED" && saw === "PAUSED") });
  }
  return out;
}

/**
 * The paused practices a Practice kept measure row speaks for (the lead's
 * ruling 3): a CONTEXT measure every one of whose tasks is a practice an
 * answer touched (paused, refused, undone or lifted: it no longer counts in
 * every one). [] for a measure that still pays or counts another practice.
 */
export function pausedOfMeasure(row: Pick<MeasureRowView, "measureKey" | "kind" | "role">, paused: readonly PausedItem[]): PausedItem[] {
  if (row.kind !== "PRACTICE_KEPT" || row.role !== "CONTEXT") return [];
  const ids = keptTemplatesOf(row.measureKey);
  const mine = ids.map((id) => paused.find((p) => p.kind === "PRACTICE" && p.templateId === id));
  return ids.length > 0 && mine.every((p): p is PausedItem => p != null) ? mine : [];
}

// ═══ UI motion (ui-motion.md §9.3, R0; contracts §21) ═════════════════════════
//
// What the glyphs, the composites and the shader slots read, decided here so
// roadmap-ui-check pins it without rendering. Nothing here animates; nothing
// here invents a fact the view doesn't carry: a field a view lacks gives no
// seen key (so nothing moves), no strip and no whose-date word, never a guess.

/**
 * Fields the views don't carry yet (contracts §21.6: a lib round adds them).
 * The builders below read them when present and stay silent when not; the
 * /dev/style fixtures carry them, so the lanes can build against them.
 *   ProficiencyView.basisKey   `${basisVersion}:${hashSeed(basisSignature(detail.basis))}` (D8; proficiencyBasisKeyOf)
 *   AimCardView.version        the current acceptance's version (the plan seen basis on /you equals the page's)
 *   AimCardView.dateOrigin     who set the date ("REALISTIC" the app, "USER" yours)
 *   AimCardView.run            RUNNING's started time and staleness ("Drafting · started 09:12"; the weave stops when stale)
 *   AimCardView.rail           the plan's milestone rows (the Aim card's RouteRail strip)
 *   WeekQuestRow.dueDays       a RAISE row's due days in its window (the PipStrip)
 *   WeekQuestsView.roadmapId, .acceptedDay, .version   Today's card keys its rows as the Now section does
 */
export interface ProficiencyBasisField {
  basisKey?: string | null;
}
export interface AimCardMotionFields {
  version?: number | null;
  dateOrigin?: "REALISTIC" | "USER" | null;
  run?: { startedAt: string; stale: boolean } | null;
  rail?: readonly MilestoneRowView[] | null;
}
export interface WeekQuestDueDays {
  dueDays?: readonly DayKey[] | null;
}
/** WeekQuestsView's roadmap and acceptance (Today's card shares the Now section's seen keys: a done check plays once). */
export interface WeekQuestMotionFields {
  roadmapId?: string | null;
  acceptedDay?: DayKey | null;
  version?: number | null;
}

// ─── Seen keys (D8, §5.6): two basis families, never a surface in `what` ───

/** The `what` of each fact two surfaces share (rank, seal, reach, horizon, the headline meter, the realistic date): no surface in it, so a rise plays once per viewer. */
export const SEEN_WHAT = { rank: "rank", seal: "seal", reach: "reach", horizon: "horizon", proficiency: "meter:proficiency", date: "date" } as const;
export type SeenWhat = (typeof SEEN_WHAT)[keyof typeof SEEN_WHAT] | `measure:${string}` | `wq:${string}`;
/** A MeasureRow's meter: Proficiency's basis when its target changed with a rebase, else the plan's (seenKeyOf's `proficiency` option). */
export function seenMeasureWhat(measureKey: string): `measure:${string}` {
  return `measure:${measureKey}`;
}
/** A week quest row's count (its done check plays when it reaches N): one key per week and row ("wq", so no bare name rule trips). */
export function seenQuestWhat(weekStart: DayKey, ord: number): `wq:${string}` {
  return `wq:${weekStart}:${ord}`;
}
/** The whats keyed on Proficiency's basis (D8): a rebase never animates. */
const PROFICIENCY_WHATS: ReadonlySet<string> = new Set([SEEN_WHAT.horizon, SEEN_WHAT.proficiency]);

/** D8's Proficiency basis key, from the reading's detail: the lib passes basisSignature(detail.basis) (roadmap-proficiency). */
export function proficiencyBasisKeyOf(basisVersion: number, signature: string): string {
  return `${basisVersion}:${hashSeed(signature)}`;
}

/**
 * A roadmap's two seen bases, in glyph/useSeen's families (proficiencyBasis
 * "prof/…", planBasis "plan/…"; roadmap-ui-check holds the strings equal):
 *   prof  Proficiency-driven keys (the headline meter, the horizon front, a measure whose target changed)
 *   plan  every other key (rank, reach, seal, the date, week quests): the acceptance day and the plan version
 * null where the view lacks the fact (no Proficiency basis key, no version): that key plays nothing.
 */
export interface SeenBases {
  roadmapId: string;
  prof: string | null;
  plan: string | null;
}

function seenRoadmapId(id: string | null | undefined): string | null {
  return id && !id.includes(":") ? id : null;
}
function profBasisOf(p: (ProficiencyView & ProficiencyBasisField) | null | undefined): string | null {
  const k = p?.basisKey;
  return typeof k === "string" && k.length > 0 ? `prof/${k}` : null;
}
function planBasisOf(acceptedDay: DayKey | null | undefined, version: number | null | undefined): string | null {
  return acceptedDay && typeof version === "number" && Number.isFinite(version) ? `plan/${acceptedDay}:${version}` : null;
}

/** The living roadmap's bases: the header's acceptance day and version, the Proficiency view's basis key. */
export function seenBasesOfRoadmap(view: Pick<RoadmapView, "header" | "proficiency">): SeenBases | null {
  const id = seenRoadmapId(view.header?.id);
  if (!id || !view.header) return null;
  return { roadmapId: id, prof: profBasisOf(view.proficiency), plan: planBasisOf(view.header.acceptedDay, view.header.version) };
}

/** The Aim card's bases, the same strings as the page's for the same roadmap (so the rank key on /you equals AimHeader's). */
export function seenBasesOfAimCard(view: AimCardView & AimCardMotionFields): SeenBases | null {
  const id = seenRoadmapId(view.roadmapId);
  if (!id) return null;
  return { roadmapId: id, prof: profBasisOf(view.proficiency), plan: planBasisOf(view.acceptedDay ?? null, view.version ?? null) };
}

/** A week quests card's bases (Today, the Aim card's line): the plan basis only, when the view carries its roadmap and acceptance. */
export function seenBasesOfWeekQuests(view: Partial<WeekQuestsView> & WeekQuestMotionFields): SeenBases | null {
  const id = seenRoadmapId(view.roadmapId);
  return id ? { roadmapId: id, prof: null, plan: planBasisOf(view.acceptedDay ?? null, view.version ?? null) } : null;
}

/** The roadmap and basis a composite takes (RankSeal, RouteRail: their `what` is their own, "rank" and "reach"). */
export function seenBaseOf(bases: SeenBases | null, family: "prof" | "plan"): Omit<SeenKey, "what"> | null {
  const basis = bases ? bases[family] : null;
  return bases && basis ? { roadmapId: bases.roadmapId, basis } : null;
}

/** One key: Proficiency's family for the headline meter and the horizon (and a measure with `proficiency`), the plan's for the rest. */
export function seenKeyOf(bases: SeenBases | null, what: SeenWhat, opts: { proficiency?: boolean } = {}): SeenKey | null {
  const base = seenBaseOf(bases, PROFICIENCY_WHATS.has(what) || opts.proficiency ? "prof" : "plan");
  return base ? { ...base, what } : null;
}

/** The realistic date as a seen value (date-moved, CHANGED): a number that reads back as its day, so "moved from 7 Mar" can be said from it. */
export function daySeenValue(day: DayKey): number {
  return Number(day.replace(/-/g, ""));
}
export function dayOfSeenValue(v: number | null | undefined): DayKey | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 19700101 || v > 99991231) return null;
  const s = String(v);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/**
 * What a viewer last saw, for a fixture (the SEEN states: rank-new,
 * reach-new, quest-done-new, date-moved, since-line …): the page seeds the
 * seen store with these before its surfaces read it (glyph/useSeen writeSeen,
 * or seenStorageOf's entries), so the fixture plays its event once.
 */
export interface SeenSeed {
  key: SeenKey;
  value: number | string;
}

/** Seeds from one roadmap's bases: [what, value, { proficiency? }]; a key the bases can't make is left out. */
export function seenSeedsOf(bases: SeenBases | null, entries: readonly (readonly [SeenWhat, number | string, { proficiency?: boolean }?])[]): SeenSeed[] {
  const out: SeenSeed[] = [];
  for (const [what, value, opts] of entries) {
    const key = seenKeyOf(bases, what, opts ?? {});
    if (key) out.push({ key, value });
  }
  return out;
}

/** The seeds as glyph/useSeen stores them: one entry per roadmap and basis, `xtnl:seen:ev:${roadmapId}:${basis}` → { at, e: { [what]: token } } (strings as hashSeed). */
export function seenStorageOf(seeds: readonly SeenSeed[], at = 0): Record<string, { at: number; e: Record<string, number> }> {
  const out: Record<string, { at: number; e: Record<string, number> }> = {};
  for (const s of seeds) {
    const k = `xtnl:seen:ev:${s.key.roadmapId}:${s.key.basis}`;
    const entry = (out[k] ??= { at, e: {} });
    entry.e[s.key.what] = typeof s.value === "number" ? s.value : hashSeed(s.value);
  }
  return out;
}

// ─── The Aim rank (D5, D18): held counted reaches only ───

export interface RankSealModel {
  /** The rank held for good (confirmed reaches only; a pending reach moves nothing). */
  index: number;
  name: AimRankName;
  /** The plan's top rank (RankSeal `top`: the pips above it are beyond the plan). */
  top: number;
  /** The next rank, drawn active (never done) beside its verb: "gives Aim rank X" / "Next · X · milestone 2". */
  next: { index: number; name: AimRankName; milestoneOrd: number | null } | null;
  /** The next milestone keeps the rank ("[rank.N done] keeps your rank"). */
  keeps: boolean;
  /** A reach waiting on ticks: no seal and no rank motion until it counts (D18). */
  pending: { milestoneOrd: number; countsFrom: DayKey } | null;
  /** The static "new" chip's day (RANK_NEW_DAYS); the motion is the seen event, not this. */
  newSince: DayKey | null;
}

export function rankSealOf(rank: AimRankView | null | undefined): RankSealModel | null {
  if (!rank) return null;
  const n = rank.next;
  const next =
    n.kind === "milestone"
      ? { index: n.index, name: n.name, milestoneOrd: n.milestoneOrd }
      : n.kind === "paragon" && rank.top.index > rank.index
        ? { index: rank.top.index, name: rank.top.name, milestoneOrd: null }
        : null;
  return { index: rank.index, name: rank.name, top: rank.top.index, next, keeps: n.kind === "keeps", pending: rank.pending, newSince: rank.newSince };
}

// ─── The milestones as a RouteRail (§4.5): one state per MilestoneRowState ───

const GATE_OF: Readonly<Record<GateStage, StageGate>> = { FOUNDATION: "foundation", FAMILIAR: "familiar", RETAINED: "retained", FLUENT: "fluent", MASTERED: "mastered" };
const GATE_AT_LEVEL: Readonly<Record<number, StageGate>> = { 4: "foundation", 6: "familiar", 8: "retained", 10: "fluent", 12: "mastered" };
const TRACK_STAGE_N: Readonly<Record<string, number>> = { STAGE_1: 1, STAGE_2: 2, STAGE_3: 3, STAGE_4: 4, STAGE_5: 5 };

/** The stage's cairn: its gate (stones), and which stage glyph (BETWEEN draws "toward", PART "part", a track plan "track" with n stones). */
export function stageGlyphOf(stage: StageKey | string | null | undefined, gateLevel: number | null | undefined): { glyph: "stage.foundation" | "stage.familiar" | "stage.retained" | "stage.fluent" | "stage.mastered" | "stage.toward" | "stage.part" | "stage.track"; gate: StageGate | null; n: number | null } | null {
  if (!stage) return null;
  if (stage in GATE_OF) {
    const gate = GATE_OF[stage as GateStage];
    return { glyph: `stage.${gate}`, gate, n: null };
  }
  if (stage === "BETWEEN" && typeof gateLevel === "number") {
    const gate = GATE_AT_LEVEL[gateLevel + 1] ?? null;
    return gate ? { glyph: "stage.toward", gate, n: null } : null;
  }
  if (stage === "PART" && typeof gateLevel === "number") {
    const gate = GATE_AT_LEVEL[gateLevel] ?? null;
    return gate ? { glyph: "stage.part", gate, n: null } : null;
  }
  if (stage in TRACK_STAGE_N) return { glyph: "stage.track", gate: null, n: TRACK_STAGE_N[stage] };
  return null;
}

/**
 * One rail node per row, with its honest words. The rail's states map one to
 * one (REACHED, PENDING_REACH, CURRENT, PLANNED, OUTLINE, LATER, DROPPED,
 * SLIPPED, PAST_DUE, CLOSED_UNREACHED). A stage held when the plan began
 * (row.held) is drawn reached, with "Held when you began" and no rank: the
 * user holds that level; it was never a reach, and RouteRail's HELD node
 * (a held day's HeldGlyph) would claim a freeze it isn't.
 */
export interface RailNodeModel {
  n: number;
  state: MilestoneRowView["state"];
  /** A stage held when the plan began: drawn REACHED, no rank, "Held when you began". */
  heldAtStart: boolean;
  /** RouteRail counts REACHED nodes for `reach`; a pending reach is never counted (D18). */
  counted: boolean;
  title: string;
  /** The title's provenance: DRAFT and KEPT_SUGGESTION carry the Gemini chip with its who-word (D25). */
  titleClass: TextClass | null;
  /** The title is in Gemini's words (the only rows the pv.suggest badge may sit on). */
  gemini: boolean;
  /** The node's one accessible label: the place, the title and the row's full line. */
  label: string;
  /** The visible second line a state must carry (§8): pending, closed, past due, slipped, held; null otherwise. */
  meta: string | null;
  /** CURRENT's measured % (the arc); a reached node's figure; null when not measured. */
  pct: number | null;
  gate: StageGate | null;
  /** A reached node that gave a rank: the rank cut out of the disc (the cairn otherwise). */
  rankIndex: number | null;
  /** PENDING_REACH: the weekday it counts from ("Thu"). */
  countsFrom: string | null;
  /** CLOSED_UNREACHED: the % it closed at. */
  closedPct: number | null;
  /** The row's ▸: the date span, the rank it gives, the state's full line. */
  more: string[];
}

/** One node per row, in place order; `plan` (rankPlanOf) adds "Reaching it gives the Aim rank …" to the rows not reached. */
export function railNodesOf(rows: readonly MilestoneRowView[], opts: { today?: DayKey; plan?: Readonly<Record<string, RankPlanEntry>> } = {}): RailNodeModel[] {
  const { today, plan } = opts;
  return [...rows]
    .filter((r) => r.state !== "LATER")
    .sort((a, b) => a.ord - b.ord)
    .map((r) => {
      const held = r.held === true;
      const state: MilestoneRowView["state"] = held ? "REACHED" : r.state;
      const stage = stageGlyphOf(r.stage, r.gateLevel);
      const line = held ? heldRowLine(r.rankIndex) : milestoneRowLine(r, today);
      const meta =
        held
          ? heldRowLine(null)
          : r.state === "PENDING_REACH"
            ? r.countsFrom
              ? `Reached · counts from ${weekdayName(r.countsFrom)}`
              : "Reached · not counted yet"
            : r.state === "CLOSED_UNREACHED"
              ? r.closedPercent != null
                ? `Closed at ${r.closedPercent}% · not reached`
                : "Closed · not reached"
              : r.state === "PAST_DUE"
                ? "Past due"
                : r.state === "SLIPPED"
                  ? "Slipped"
                  : null;
      const more: string[] = [];
      if (r.windowStart && r.dueDay) more.push(`${dayLabel(r.windowStart, today)} – ${dayLabel(r.dueDay, today)}`);
      const entry = plan?.[r.id] ?? plan?.[r.lineageId];
      if (!held && state !== "REACHED" && state !== "PENDING_REACH" && state !== "DROPPED" && state !== "CLOSED_UNREACHED" && entry) more.push(givesRankLine(entry.rankIndex, entry.gives));
      if (r.state === "PENDING_REACH" && r.countsFrom) more.push(pendingReachLine(r.countsFrom));
      else if (r.state === "PAST_DUE") more.push(pastDueLine(r.ord, r.dueDay, today));
      else more.push(line);
      const gemini = r.titleClass === "DRAFT" || r.titleClass === "KEPT_SUGGESTION";
      return {
        n: r.ord,
        state,
        heldAtStart: held,
        counted: state === "REACHED",
        title: r.title,
        titleClass: r.titleClass ?? null,
        gemini,
        label: `Milestone ${r.ord} · ${r.title} · ${line}`,
        meta,
        pct: state === "REACHED" && !held ? (r.percent ?? 100) : r.state === "CURRENT" ? r.percent : null,
        gate: stage?.gate ?? null,
        // a reached node shows the rank it gave (the row's gaveRank, or the plan's entry); a held stage gave none
        rankIndex: state === "REACHED" && !held && (r.gaveRank != null || entry?.gives === true) ? r.rankIndex : null,
        countsFrom: r.state === "PENDING_REACH" && r.countsFrom ? weekdayName(r.countsFrom) : null,
        closedPct: r.state === "CLOSED_UNREACHED" ? r.closedPercent : null,
        more: [...new Set(more)],
      };
    });
}

/** The Aim card's strip (§3.3 screen 9): the plan's rows when the card carries them (AimCardView.rail), else none: the card never draws places it can't name. */
export function aimRailOf(view: AimCardView & AimCardMotionFields, today?: DayKey): RailNodeModel[] | null {
  return view.rail && view.rail.length > 0 ? railNodesOf(view.rail, { today }) : null;
}

/** The `reach` seen value: RouteRail's own count of REACHED nodes (a pending reach never counts; a held stage is constant). */
export function countedReachOf(nodes: readonly Pick<RailNodeModel, "state">[]): number {
  return nodes.filter((x) => x.state === "REACHED").length;
}

// ─── Due-day pips (a RAISE row's PipStrip) ───

const PIP_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The life week of `day` as seven pips: due counts, today outlined, past days marked; the label in words. */
export function pipDaysOf(dueDays: readonly DayKey[], weekOf: DayKey, today: DayKey): { days: PipDay[]; label: string } {
  const start = weekStartKeyOf(weekOf);
  const days: PipDay[] = PIP_KEYS.map((key, i) => {
    const day = addDays(start, i);
    return { key, n: dueDays.filter((d) => d === day).length, ...(day === today ? { today: true } : {}), ...(day < today ? { past: true } : {}) };
  });
  return { days, label: dueDaysLabel(days) };
}

/** A week quest row's pips: RAISE rows that carry their due days; null otherwise (the due sentence stays). */
export function rowPipsOf(row: WeekQuestRow & WeekQuestDueDays, today: DayKey): { days: PipDay[]; label: string } | null {
  if (row.kind !== "RAISE" || !row.dueDays || row.dueDays.length === 0) return null;
  return pipDaysOf(row.dueDays, today, today);
}

// ─── The horizon band (§6.1, §6.2): the slot's inputs ───

export interface HorizonModel {
  variant: "card" | "page";
  /** null: the unlit marks (no dawn, no dot); never an invented 0%. */
  proficiency: (ProficiencyView & ProficiencyBasisField) | null;
  roadmapId: string;
  /** The Proficiency seen basis (`prof/…`, the family the headline meter shares); null: no horizon-front. */
  basisKey: string | null;
  /** The target depth: one contour per level. */
  depth: number | null;
  status: RoadmapStatus;
  /** SELF_REPORTED: the walked path dotted, and the words "from your ticks" beside the % (outside the band). */
  fromYourTicks: boolean;
}

/** The Aim card's band: ACTIVE, ACCEPTED, PAST_DUE and DONE (static); none on EMPTY, DRAFT or RUNNING (RUNNING has the weave). */
export function horizonOfAimCard(view: AimCardView & AimCardMotionFields): HorizonModel | null {
  if (view.state === "EMPTY" || view.state === "DRAFT" || view.state === "RUNNING" || !view.roadmapId || view.legacy) return null;
  const p = view.proficiency ?? null;
  const bases = seenBasesOfAimCard(view);
  return { variant: "card", proficiency: p, roadmapId: view.roadmapId, basisKey: bases?.prof ?? null, depth: view.depth ?? null, status: view.state === "DONE" ? "DONE" : "ACTIVE", fromYourTicks: p?.class === "SELF_REPORTED" };
}

/** The living header's band (ACTIVE, DONE, ARCHIVED); the draft header and the empty roadmap get the unlit marks; RUNNING has the weave. */
export function horizonOfRoadmap(view: Pick<RoadmapView, "state" | "header" | "proficiency" | "draft" | "depth">): HorizonModel | null {
  if (view.state === "RUNNING") return null;
  if (view.state === "NONE" || !view.header) return { variant: "page", proficiency: null, roadmapId: "", basisKey: null, depth: null, status: "DRAFT", fromYourTicks: false };
  if (view.header.legacy) return null;
  const draft = view.state === "DRAFT";
  const p = draft ? null : (view.proficiency ?? null);
  const depth = draft ? (view.draft?.depth?.depth ?? view.header.depth ?? null) : (view.header.depth ?? view.depth?.depth ?? null);
  const bases = seenBasesOfRoadmap(view);
  return { variant: "page", proficiency: p, roadmapId: view.header.id, basisKey: draft ? null : (bases?.prof ?? null), depth, status: view.header.status, fromYourTicks: p?.class === "SELF_REPORTED" };
}

// ─── Whose date (C2-M2): the app's estimate at month precision, or yours ───

export interface AimDateModel {
  /** "app": the app set it (an estimate, ≈, month precision, t.cal); "yours": the user's own date (t.pin + "yours"); null: the view doesn't say. */
  whose: "app" | "yours" | null;
  day: DayKey;
  level: number | null;
  estimate: boolean;
  glyph: "t.cal" | "t.pin";
  /** "L12 by ≈ Dec 2027" · "31 Dec 2027 · yours" · "L12 by Dec 2027". */
  text: string;
}

function dateModel(whose: "app" | "yours" | null, day: DayKey, level: number | null): AimDateModel {
  if (whose === "yours") return { whose, day, level, estimate: false, glyph: "t.pin", text: shortDateYours(day) };
  if (whose === "app") return { whose, day, level, estimate: true, glyph: "t.cal", text: shortDateBy(level, day) };
  return { whose, day, level, estimate: false, glyph: "t.cal", text: shortDatePlain(level, day) };
}

export function aimDateOfHeader(header: Pick<RoadmapHeader, "targetDay" | "depth" | "dateOrigin">): AimDateModel {
  const o = header.dateOrigin?.origin;
  return dateModel(o === "USER" ? "yours" : o === "REALISTIC" ? "app" : null, header.targetDay, header.depth ?? null);
}

/** The Aim card's date chip: whose from dateOrigin when the card carries it; a calibrating estimate is always the app's. */
export function aimDateOfCard(view: AimCardView & AimCardMotionFields): AimDateModel | null {
  const chip = view.dateChip ?? null;
  const day = chip?.day ?? view.targetDay;
  if (!day) return null;
  const o = view.dateOrigin ?? null;
  const whose = o === "USER" ? "yours" : o === "REALISTIC" || chip?.estimate ? "app" : null;
  return dateModel(whose, day, chip?.depth ?? view.depth ?? null);
}

// ─── Honest flags (D28): unverified, best case, calibrating stay visible ───

export interface RealismFlags {
  /** Capacity calibrates (adherence or tracked time), or a milestone's time check says so: the verdict reads "Unverified · …". */
  unverified: boolean;
  /** The date rests on an assumed pass rate (or a reach's best case): «best case» beside it. */
  bestCase: boolean;
  /** The pass rate calibrates: "pass rate calibrating n/need" in place of a %. */
  calibrating: { n: number; need: number } | null;
  /** A measured pass rate: «reads high» beside it (neglect lapses aren't logged). */
  readsHigh: boolean;
  /** Task-time estimates sized by Gemini (0..1): «n% sized by Gemini». */
  sizedByGemini: number | null;
}

export function realismFlagsOf(p: { throughput?: Throughput | null; dateCheck?: DateCheck | null; feasibility?: Feasibility | null }): RealismFlags {
  const tp = p.throughput ?? null;
  const pass = tp?.passShare ?? null;
  const knowledgeBestCase = (p.feasibility?.milestones ?? []).some((m) => m.knowledge.some((k) => k.bestCase));
  const timeUnverified = (p.feasibility?.milestones ?? []).some((m) => m.time.unverified);
  return {
    unverified: timeUnverified || tp?.adherence.kind === "calibrating" || tp?.trackedMinutes.kind === "calibrating",
    bestCase: knowledgeBestCase || (p.dateCheck?.dateOrigin.calibrating ?? []).includes("p") || pass?.kind === "calibrating",
    calibrating: pass?.kind === "calibrating" ? { n: pass.have, need: pass.need } : null,
    readsHigh: pass?.kind === "measured",
    sizedByGemini: typeof tp?.geminiShare === "number" && tp.geminiShare > 0 ? tp.geminiShare : null,
  };
}

/** A CapacityGauge's verdict: "Unverified · Fits" while the time check calibrates. */
export function capacityFlagsOf(time: Pick<TimeCheck, "unverified"> | null | undefined): { unverified: boolean } {
  return { unverified: time?.unverified === true };
}

/** The pace phrase: «best case» when the projection rests on a calibrating pass rate. */
export function paceFlagsOf(pace: PaceResult | PracticePace | null | undefined): { bestCase: boolean } {
  return { bestCase: pace != null && "bestCase" in pace && pace.bestCase === true };
}

// ─── The draft header's lanes (D25) and the health chip (D12) ───

/** Gemini's lane lists only what geminiV4PartsOf says it did on this draft ([]: the lane isn't drawn). */
export function geminiLaneItemsOf(p: Pick<GeminiV4Parts, "needs" | "order" | "picks">): string[] {
  return [...(p.needs ? [GEMINI_LANE_ITEM.needs] : []), ...(p.order != null ? [GEMINI_LANE_ITEM.order] : []), ...(p.picks > 0 ? [GEMINI_LANE_ITEM.picks] : [])];
}

/**
 * One «Not medical advice · ask a professional» per card (D12): a body or
 * care card, or a card with a health row (a body-plan practice, a craft card
 * that asks); never a Field card; dropped when a HEALTH flag on the card
 * already shows HEALTH_LINE.
 */
export function healthChipShown(p: { track?: Track | null; healthRows?: boolean; healthFlagShown?: boolean }): boolean {
  if (p.healthFlagShown) return false;
  return p.track === "BODY" || p.track === "CARE" || p.healthRows === true;
}

/** InfoTips a card renders at most, the Key included (D13). */
export const INFO_TIPS_PER_CARD = 3;
