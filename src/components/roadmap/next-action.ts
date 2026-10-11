/**
 * The plan page's one next action (the hero above the plan): what to do now, picked by a pure priority over the
 * RoadmapView the page already loads. No read, no write, no model; roadmap-ui-check holds a golden per branch.
 *
 * The priority (the first that applies is the primary; up to two more open actions become chips):
 *
 *   NONE / legacy          SET_AIM       "Set an aim" (or the legacy plan's own restart)    → /you/roadmap/new
 *   RUNNING                DRAFTING      a line, no button (the draft is being written)
 *   DRAFT                  CHECK_DRAFT   the review below holds Accept                     (no button here)
 *   DONE / ARCHIVED        NEW_AIM       "Set a new aim"                                   → /you/roadmap/new
 *   ACTIVE:
 *     1. ACTIVITIES        the activity card asks (a safety answer the plan waits on)        → #rm-activities
 *     2. REPLAN_DRAFT      a re-plan draft waits for Accept or Discard                       → #replan
 *     3. FINISH_START      Start didn't finish                                               (runs finishStarting)
 *     4. MARK_DONE         the aim is reached on its readings                                (the Mark done sheet)
 *     5. PAST_DUE          the current milestone is past due: Reschedule, or close it on Tasks
 *     6. START             the current milestone is planned and Start is live                (the Start sheet)
 *        START_LATER       … and Start is not live yet: a line, no button (never a disabled Start)
 *     7. this week's open week quests, in this order, each with its figure:
 *          ADD             "Add 3 cards to <Domain>": the part with the most left       → /add?field=&domain=
 *          REVIEW          "Review 2 cards in <Domain>": cards to bring to the level    → the week quests (their due days);
 *                          never a link to /review (Review has no Domain filter: roadmap.md, Names)
 *          PRACTICE        "Practise <name> · 2 sessions"                                → its task on Tasks (/today#t-…)
 *          STEP            the step's own words                                          → its task on Tasks
 *          CHECKPOINT      "Log a score"                                                 (the checkpoint sheet)
 *     8. CHECKPOINT        a started milestone's checkpoint with no score yet (no week quest row for it)
 *     9. TASKS             nothing open this week                                        → Tasks
 *        REPLAN            an ACTIVE plan with no current milestone                       (the Re-plan sheet)
 *
 * ADD comes before REVIEW: it has somewhere to go (the add flow with the Domain preselected), and reviews happen as
 * cards come due. Secondary chips are week-quest kinds (and "Close it on Tasks" beside Reschedule), one per kind,
 * never the primary's own kind.
 */
import type { CurrentMilestoneView, ItemDraft, RoadmapView, WeekQuestRow } from "@/lib/roadmap-types";
import { DRAFT_IT_AGAIN_WORD, START_AGAIN_AT_DEPTH_WORD, nextActionLabelOf, nextChipLabelOf } from "./roadmap-copy";
import { addCardHref, ROADMAP_NEW_HREF, TODAY_HREF, todayTaskHref } from "./roadmap-links";
import { activityAsksOf, practiceNameOf, weekQuestProgressOf } from "./roadmap-ui-model";

export type NextActionKind =
  | "SET_AIM"
  | "DRAFTING"
  | "CHECK_DRAFT"
  | "NEW_AIM"
  | "ACTIVITIES"
  | "REPLAN_DRAFT"
  | "FINISH_START"
  | "MARK_DONE"
  | "PAST_DUE"
  | "CLOSE_ON_TASKS"
  | "START"
  | "START_LATER"
  | "ADD"
  | "REVIEW"
  | "PRACTICE"
  | "STEP"
  | "CHECKPOINT"
  | "TASKS"
  | "REPLAN";

/** What an action does on tap: a link, an in-page anchor (opening what it points at), a sheet the page holds, a run, or nothing. */
export type NextActionDo =
  | { kind: "href"; href: string }
  | { kind: "reveal"; target: "week-quests" | "replan" | "rm-activities" }
  | { kind: "sheet"; sheet: "start" | "checkpoint" | "markDone" | "reschedule" | "replan" }
  | { kind: "run"; run: "finishStart" }
  | { kind: "none" };

export interface NextAction {
  kind: NextActionKind;
  /** The full words: the verb first, the figure, its unit, and a name ("Add 3 cards to Risk Management"). */
  label: string;
  /** A chip's words: the verb and the figure ("Add 3"). */
  short: string;
  /** What is left (cards, sessions, steps); null without a count. */
  n: number | null;
  unit: "card" | "session" | "step" | null;
  /** A Domain, practice or step name inside `label` (a name for the word count, §3.1); null: none. */
  name: string | null;
  do: NextActionDo;
}

export interface NextActions {
  primary: NextAction;
  /** ≤ 2, one per kind, never the primary's kind. */
  secondary: NextAction[];
}

/** The kinds a secondary chip can be. */
export const NEXT_CHIP_KINDS: ReadonlySet<NextActionKind> = new Set(["ADD", "REVIEW", "PRACTICE", "STEP", "CHECKPOINT", "CLOSE_ON_TASKS"]);
/** At most this many chips beside the primary. */
export const NEXT_SECONDARY_MAX = 2;
/** The order open week quests are offered in (ADD first: it has somewhere to go). */
export const NEXT_ROW_ORDER: readonly WeekQuestRow["kind"][] = ["ADD", "RAISE", "PRACTICE", "STEP", "CHECKPOINT"];

function action(kind: NextActionKind, doIt: NextActionDo, p: { n?: number | null; unit?: NextAction["unit"]; name?: string | null; ord?: number | null; label?: string } = {}): NextAction {
  const n = p.n ?? null;
  const unit = p.unit ?? null;
  const name = p.name && p.name.trim() ? p.name.trim() : null;
  const label = p.label ?? nextActionLabelOf({ kind, n, unit, name, ord: p.ord ?? null });
  return { kind, label, short: p.label ?? nextChipLabelOf({ kind, n }), n, unit, name, do: doIt };
}

/** What a row still asks (its count less its verified progress), never below 0. */
export function rowLeftOf(row: Pick<WeekQuestRow, "count" | "figure" | "done">): number {
  if (row.done) return 0;
  return Math.max(0, Math.round(row.count - weekQuestProgressOf(row as WeekQuestRow)));
}

/** The query value of `key` in an app href ("/add?field=f&domain=d" → d), or null. */
function queryOf(href: string | null, key: string): string | null {
  if (!href) return null;
  const q = href.split("#")[0].split("?")[1];
  if (!q) return null;
  for (const pair of q.split("&")) {
    const [k, v] = pair.split("=");
    if (k === key && v) return decodeURIComponent(v);
  }
  return null;
}

/** The Domains a v1 label names ("Add 5 cards to Risk Management or Position Sizing" → both), in order; [] when it names none. */
function namesOfLabel(label: string): string[] {
  const m = /^(?:Add \d+ cards? to |Bring \d+ cards? in )(.+?)(?: to level \d+\+)?$/.exec(label);
  if (!m) return [];
  return m[1].split(/ or |, | and /).map((x) => x.trim()).filter(Boolean);
}

/** The part with the most left (ties: the earlier part), or null on a v1 row. */
function leadPartOf(row: WeekQuestRow): NonNullable<WeekQuestRow["parts"]>[number] | null {
  let lead: NonNullable<WeekQuestRow["parts"]>[number] | null = null;
  for (const p of row.parts ?? []) {
    if (p.done) continue;
    const left = Math.max(0, p.count - p.progress);
    if (left <= 0) continue;
    if (!lead || left > Math.max(0, lead.count - lead.progress)) lead = p;
  }
  return lead;
}

/** One open week quest row as an action; null when nothing is left on it. */
export function rowActionOf(row: WeekQuestRow, view: Pick<RoadmapView, "library">): NextAction | null {
  const left = rowLeftOf(row);
  if (left <= 0) return null;
  switch (row.kind) {
    case "ADD": {
      const part = leadPartOf(row);
      const domainId = part?.domainId ?? queryOf(row.href, "domain");
      const fieldId = queryOf(row.href, "field") ?? (domainId ? (view.library?.find((d) => d.id === domainId)?.fieldId ?? null) : null);
      // The Domain the add flow preselects (the row's own pick): adding there counts, whichever of the row's Domains it is.
      const name = part ? String(part.name) : ((domainId ? view.library?.find((d) => d.id === domainId)?.name : null) ?? namesOfLabel(row.label)[0] ?? null);
      const n = part ? Math.max(0, part.count - part.progress) : left;
      const href = domainId ? addCardHref(fieldId, domainId) : (row.href ?? null);
      if (!href) return null;
      return action("ADD", { kind: "href", href }, { n, unit: "card", name });
    }
    case "RAISE": {
      // A part names its own Domain; a v1 row names one only when it has one (its cards may sit in any of them).
      const part = leadPartOf(row);
      const named = namesOfLabel(row.label);
      const name = part ? String(part.name) : named.length === 1 ? named[0] : null;
      const n = part ? Math.max(0, part.count - part.progress) : left;
      return action("REVIEW", { kind: "reveal", target: "week-quests" }, { n, unit: "card", name });
    }
    case "PRACTICE": {
      const href = row.href ?? (row.seekTemplateId ? todayTaskHref(row.seekTemplateId) : TODAY_HREF);
      return action("PRACTICE", { kind: "href", href }, { n: left, unit: "session", name: practiceNameOf(row.label) });
    }
    case "STEP": {
      const href = row.href ?? (row.seekTemplateId ? todayTaskHref(row.seekTemplateId) : TODAY_HREF);
      return action("STEP", { kind: "href", href }, { n: left, unit: "step", name: row.label.replace(/^Step: /, "") });
    }
    case "CHECKPOINT":
      return action("CHECKPOINT", { kind: "sheet", sheet: "checkpoint" });
  }
}

/** The current milestone's checkpoint item (not removed), or null. */
export function checkpointItemOf(current: Pick<CurrentMilestoneView, "milestone">): ItemDraft | null {
  return current.milestone.items.find((it) => it.kind === "CHECKPOINT" && it.decision !== "REMOVED") ?? null;
}

/** This week's open actions, in NEXT_ROW_ORDER (rows of one kind in their own order). */
function weekActionsOf(view: RoadmapView, current: CurrentMilestoneView): NextAction[] {
  const wq = view.weekQuests;
  const out: NextAction[] = [];
  const rows = wq && wq.state === "OPEN" ? wq.rows : [];
  for (const kind of NEXT_ROW_ORDER) {
    for (const row of rows.filter((r) => r.kind === kind).sort((a, b) => a.ord - b.ord)) {
      const a = rowActionOf(row, view);
      if (a) out.push(a);
    }
  }
  // A checkpoint with no score yet, when no week quest row asks for it (the week's row is the one to use when there is one).
  if (!rows.some((r) => r.kind === "CHECKPOINT") && checkpointItemOf(current) && !current.checkpointLog) out.push(action("CHECKPOINT", { kind: "sheet", sheet: "checkpoint" }));
  return out;
}

/** Every applicable action on an ACTIVE plan, in priority order (the first is the primary). */
function activeActionsOf(view: RoadmapView): NextAction[] {
  const header = view.header!;
  const current = view.current;
  const out: NextAction[] = [];
  if (activityAsksOf(view.activityConfirm)) out.push(action("ACTIVITIES", { kind: "reveal", target: "rm-activities" }));
  if (view.draft) out.push(action("REPLAN_DRAFT", { kind: "reveal", target: "replan" }));
  if (current?.starting) out.push(action("FINISH_START", { kind: "run", run: "finishStart" }));
  if (header.reachedDay) out.push(action("MARK_DONE", { kind: "sheet", sheet: "markDone" }));
  if (!current) {
    out.push(action("REPLAN", { kind: "sheet", sheet: "replan" }));
    return out;
  }
  const m = current.milestone;
  const started = Boolean(current.goalId);
  if (current.pastDue) {
    if (started) out.push(action("PAST_DUE", { kind: "sheet", sheet: "reschedule" }, { ord: m.ord }));
    out.push(action("CLOSE_ON_TASKS", { kind: "href", href: TODAY_HREF }));
    return out;
  }
  // Not started: Start (or its line), never a week quest or a score before the milestone runs (FINISH_START is above).
  if (!started) {
    if (!current.starting) out.push(view.goalsLive ? action("START", { kind: "sheet", sheet: "start" }, { ord: m.ord }) : action("START_LATER", { kind: "none" }));
    return out;
  }
  out.push(...weekActionsOf(view, current));
  out.push(action("TASKS", { kind: "href", href: TODAY_HREF }));
  return out;
}

/**
 * The page's next action and up to two more (ui-motion §16): the first action that applies, then the next open
 * week-quest kinds as chips. Pure over the view; every state has a primary (a line with no button where nothing can
 * be done yet: DRAFTING, CHECK_DRAFT, START_LATER).
 */
export function nextActionOf(view: RoadmapView): NextActions {
  const header = view.header;
  const legacy = Boolean(view.legacy || header?.legacy || view.draft?.legacy);
  let all: NextAction[];
  if (view.state === "NONE" || !header) all = [action("SET_AIM", { kind: "href", href: ROADMAP_NEW_HREF })];
  // A plan made before revision 4: its own way on (its page's one action), never a Start or a week quest.
  else if (legacy) all = [action("SET_AIM", { kind: "href", href: ROADMAP_NEW_HREF }, { label: (view.legacy?.kind ?? header.status) === "DRAFT" ? DRAFT_IT_AGAIN_WORD : START_AGAIN_AT_DEPTH_WORD })];
  else if (view.state === "RUNNING" && view.run) all = [action("DRAFTING", { kind: "none" })];
  else if (view.state === "DRAFT" && view.draft) all = [action("CHECK_DRAFT", { kind: "none" })];
  else if (header.status === "DONE" || header.status === "ARCHIVED") all = [action("NEW_AIM", { kind: "href", href: ROADMAP_NEW_HREF })];
  else all = activeActionsOf(view);
  const [primary, ...rest] = all;
  const seen = new Set<NextActionKind>([primary.kind]);
  const secondary: NextAction[] = [];
  for (const a of rest) {
    if (secondary.length >= NEXT_SECONDARY_MAX) break;
    if (!NEXT_CHIP_KINDS.has(a.kind) || seen.has(a.kind)) continue;
    seen.add(a.kind);
    secondary.push(a);
  }
  return { primary, secondary };
}
