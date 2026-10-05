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
 *   Activities   activityCardOf · activityAsksOf · activitySuggestsOf · activityOpenOf · activityAvoidOf · activityCardAnswerOf ·
 *                activityNothingToAvoidOf · activityBlockedOf · pickerExcludedOf · activityWaitingOf · heldPracticesOf ·
 *                practiceOnlyLineOf · rowsAnsweredBy · intakeActivityOf · aimConflictLineOf · pausedOfReply · notPausedOfReply (§19)
 */
import {
  ACTIVITY_REASON_MAX,
  PARAGON_MIN_MILESTONES,
  SOURCE_NOTE_MAX,
  TYPICAL_HOURS_MAX,
  TYPICAL_HOURS_MIN,
  WEEK_QUEST_ROWS_TODAY,
  draftNeedsOf,
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
  type AimRankView,
  type BlockingFlag,
  type CueTexts,
  type Decision,
  type ItemDraft,
  type ItemKind,
  type KnowledgeCheck,
  type KnowledgeVerdict,
  type LibraryDomain,
  type MilestoneDraft,
  type MilestoneRowView,
  type MilestoneStatus,
  type Origin,
  type ProficiencyView,
  type DraftView,
  type RoadmapView,
  type RunView,
  type RunWriter,
  type StartPreview,
  type StatedZeroReason,
  type TextClass,
  type WeekQuestKind,
  type WeekQuestRow,
  type WeekQuestsView,
} from "@/lib/roadmap-types";
import { statedForMilestone } from "@/lib/roadmap-economy";
import {
  activityConfirmViewOf,
  allowedKindsFor,
  catalogEntryOf,
  catalogKindsFor,
  constraintsStateOf,
  isCatalogKey,
  type CatalogKey,
  type CatalogTrack,
} from "@/lib/roadmap-catalog";
import { constraintExclusionsOf } from "@/lib/roadmap-validate";
import type { DayKey } from "@/lib/life-day";
import type { Segment } from "@/components/ui/Meter";
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
  dayLabel,
  pendingReachLine,
  weekQuestCountLine,
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

export type ItemAction = "KEEP" | "EDIT" | "REMOVE" | "CHECK" | "MAP" | "CREATE" | "DROP" | "TYPE";

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
 *   YOURS, WORKED_OUT and REMOVED rows: none.
 * An outline row (a later milestone) offers nothing: it is decided at its Start.
 * Without the user's Domains on the page (`canMap` false) no row offers Map to….
 */
export function itemActionsOf(row: EditorRow, stage: "draft" | "outline" | "active" | "start", opts: { canMap?: boolean } = {}): ItemActions {
  const out = baseActionsOf(row, stage);
  return opts.canMap === false ? withoutMap(out) : out;
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
