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
 *     6. LOCKED            a planned TOPICS layer whose prerequisites are open (ruling N27): "Add 5 cards to <parent>",
 *                          the parent that still lacks cards (the lock lists the unmet ones first)      → /add?domain=
 *                          chips: KNOWN "I know this" (skipTopic on that parent) and REVIEW_TOPIC "Review <parent> · k due"
 *                          (its Domain's review run, reviewRunHref) while it has cards due
 *        START             the current milestone is planned and Start is live                (the Start sheet)
 *        STUDY             … and Start is not live yet (ruling N28): "Study <topic> · 3 of 8 · 4 due", the first topic of
 *                          the layer not done, else the next planned layer's (N14's P15 rule)  → the Domain's review run
 *        ADD_IDEA          … with no card due in it: "Add an idea to <topic>"                  → /add?domain=
 *        START_LATER       … and no topic is left to study: a line, no button (never a disabled Start)
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
import { CROSS_GOAL_PARENT_PREFIX, geminiNamedOf, type CurrentMilestoneView, type ItemDraft, type MilestoneLockParentView, type MilestoneTopicView, type RoadmapView, type WeekQuestRow } from "@/lib/roadmap-types";
import { DRAFT_IT_AGAIN_WORD, START_AGAIN_AT_DEPTH_WORD, knownChipLabel, nextActionLabelOf, nextChipLabelOf, reviewTopicLabel, studyActionLabel } from "./roadmap-copy";
import { addCardHref, ROADMAP_NEW_HREF, TODAY_HREF, reviewRunHref, todayTaskHref } from "./roadmap-links";
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
  | "LOCKED"
  | "KNOWN"
  | "REVIEW_TOPIC"
  | "START"
  | "STUDY"
  | "ADD_IDEA"
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
  /** Ruling N27: "I know this" on the lock's parent (the existing skip core, skipTopic, on that topic's key). */
  | { kind: "run"; run: "knowTopic"; key: string }
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
  /** `name` is a Domain's that carries the Gemini mark (geminiNamedOf): NextLabel and Today's card draw pv.named after it (§22.11, ruling 67; the review round). */
  geminiNamed?: boolean;
  do: NextActionDo;
}

export interface NextActions {
  primary: NextAction;
  /** ≤ 2, one per kind, never the primary's kind. */
  secondary: NextAction[];
}

/** The kinds a secondary chip can be (the week-quest kinds, Close it on Tasks, and the lock's two: ruling N27). */
export const NEXT_CHIP_KINDS: ReadonlySet<NextActionKind> = new Set(["ADD", "REVIEW", "PRACTICE", "STEP", "CHECKPOINT", "CLOSE_ON_TASKS", "KNOWN", "REVIEW_TOPIC"]);
/** At most this many chips beside the primary. */
export const NEXT_SECONDARY_MAX = 2;
/** The order open week quests are offered in (ADD first: it has somewhere to go). */
export const NEXT_ROW_ORDER: readonly WeekQuestRow["kind"][] = ["ADD", "RAISE", "PRACTICE", "STEP", "CHECKPOINT"];

function action(kind: NextActionKind, doIt: NextActionDo, p: { n?: number | null; unit?: NextAction["unit"]; name?: string | null; geminiNamed?: boolean; ord?: number | null; label?: string; short?: string } = {}): NextAction {
  const n = p.n ?? null;
  const unit = p.unit ?? null;
  const name = p.name && p.name.trim() ? p.name.trim() : null;
  const label = p.label ?? nextActionLabelOf({ kind, n, unit, name, ord: p.ord ?? null });
  return { kind, label, short: p.short ?? p.label ?? nextChipLabelOf({ kind, n }), n, unit, name, ...(name && p.geminiNamed ? { geminiNamed: true } : {}), do: doIt };
}

// ── Roadmap rework 1, P2: the locked milestone (ruling N27) and the planned layer's study (ruling N28) ──

/** The parent a locked milestone waits on: the first not met (the lock lists them first), or null when none is open. */
export function lockedParentOf(current: Pick<CurrentMilestoneView, "lock">): MilestoneLockParentView | null {
  const lock = current.lock;
  if (!lock) return null;
  return lock.parents.find((p) => !p.met) ?? null;
}

/** The Field the add flow preselects for a Domain: the library's, else the plan's (PlanEditView.fieldId), else none. */
function fieldOfDomain(view: Pick<RoadmapView, "library" | "planEdit">, domainId: string | null): string | null {
  return (domainId ? view.library?.find((d) => d.id === domainId)?.fieldId : null) ?? view.planEdit?.fieldId ?? null;
}

/**
 * The topic to study now while the current milestone is a planned TOPICS layer (ruling N28; the Study card's rule, N14 and
 * its P15 note): the first of the current layer's topics not done, else the first not done of the next planned layer rows
 * in order (a layer whose topics are all done waits for its reach on cards, N26). The view marks the first planned row
 * PLANNED and every later one OUTLINE (milestoneRowsOf), so a later row is read by either state, unreached and not held:
 * one rule with the server's studyViewOf (the review round). Null on a LEVELS plan or with none left.
 */
export function studyTopicOf(view: Pick<RoadmapView, "milestones">, current: Pick<CurrentMilestoneView, "milestone" | "topics">): MilestoneTopicView | null {
  const todo = (topics: readonly MilestoneTopicView[] | undefined): MilestoneTopicView | null => topics?.find((t) => !t.done && t.domainId) ?? null;
  if (current.topics === undefined) return null;
  const own = todo(current.topics);
  if (own) return own;
  const later = view.milestones
    .filter((r) => r.ord > current.milestone.ord && r.chainRole === "LAYER" && (r.state === "PLANNED" || r.state === "OUTLINE") && r.reachedDay == null && !r.held && r.topics)
    .sort((a, b) => a.ord - b.ord);
  for (const r of later) {
    const t = todo(r.topics);
    if (t) return t;
  }
  return null;
}

/**
 * Ruling N27: the locked milestone's primary, "Add n cards to <parent>" (n = floor − cards, at least 1) to the add flow
 * placed in the parent's Domain (`fieldId`: the Field it preselects). One builder for the hero and Today's card (the
 * review round: studyMainQuestActionOf reads it when the study is the lock's parent, AimStudyView.locked, so the hero,
 * Today and GET /quests say the same). A parent with no Domain (a draft topic not yet accepted) cannot take a card: the
 * line says what it waits on.
 */
export function lockedPrimaryOf(parent: Pick<MilestoneLockParentView, "name" | "domainId" | "cards" | "floor" | "geminiNamed">, fieldId: string | null): NextAction {
  const left = Math.max(1, parent.floor - parent.cards);
  const href = parent.domainId ? addCardHref(fieldId, parent.domainId) : null;
  return action("LOCKED", href ? { kind: "href", href } : { kind: "none" }, { n: left, unit: "card", name: parent.name, geminiNamed: parent.geminiNamed });
}

/** Ruling N27: the locked milestone's actions: the primary and its two chips, in order. */
function lockedActionsOf(view: RoadmapView, parent: MilestoneLockParentView): NextAction[] {
  const out: NextAction[] = [lockedPrimaryOf(parent, fieldOfDomain(view, parent.domainId))];
  // A cross-goal parent (another goal's Domain) has no topic key here to mark known.
  if (!parent.key.startsWith(CROSS_GOAL_PARENT_PREFIX)) out.push(action("KNOWN", { kind: "run", run: "knowTopic", key: parent.key }, { name: parent.name, geminiNamed: parent.geminiNamed, label: knownChipLabel(parent.name), short: nextChipLabelOf({ kind: "KNOWN", n: null }) }));
  const due = parent.due ?? 0;
  if (due > 0 && parent.domainId) out.push(action("REVIEW_TOPIC", { kind: "href", href: reviewRunHref(parent.domainId) }, { n: due, unit: "card", name: parent.name, geminiNamed: parent.geminiNamed, label: reviewTopicLabel(parent.name, due), short: nextChipLabelOf({ kind: "REVIEW_TOPIC", n: due }) }));
  return out;
}

/**
 * Ruling N28: the study as one action: the topic's review run while it has cards due, else an idea filed in its Domain
 * (`fieldId`: the Field the add flow preselects). Today's Main quest card and GET /quests call it with the plan's Field.
 */
export function studyActionOf(t: Pick<MilestoneTopicView, "name" | "domainId" | "cards" | "floor" | "due"> & { geminiNamed?: boolean; locked?: boolean }, fieldId: string | null): NextAction {
  // The review round: a locked layer's study is the lock's first unmet parent (AimStudyView.locked): the hero's LOCKED primary.
  if (t.locked) return lockedPrimaryOf({ name: t.name, domainId: t.domainId, cards: t.cards, floor: t.floor, geminiNamed: t.geminiNamed === true }, fieldId);
  const domainId = t.domainId as string;
  if (t.due > 0) return action("STUDY", { kind: "href", href: reviewRunHref(domainId) }, { n: t.due, unit: "card", name: t.name, geminiNamed: t.geminiNamed, label: studyActionLabel(t.name, t.cards, t.floor, t.due) });
  return action("ADD_IDEA", { kind: "href", href: addCardHref(fieldId, domainId) }, { name: t.name, geminiNamed: t.geminiNamed });
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
      const lib = domainId ? view.library?.find((d) => d.id === domainId) : undefined;
      const name = part ? String(part.name) : (lib?.name ?? namesOfLabel(row.label)[0] ?? null);
      const n = part ? Math.max(0, part.count - part.progress) : left;
      const href = domainId ? addCardHref(fieldId, domainId) : (row.href ?? null);
      if (!href) return null;
      return action("ADD", { kind: "href", href }, { n, unit: "card", name, geminiNamed: lib ? geminiNamedOf(lib) : false });
    }
    case "RAISE": {
      // A part names its own Domain; a v1 row names one only when it has one (its cards may sit in any of them).
      const part = leadPartOf(row);
      const named = namesOfLabel(row.label);
      const name = part ? String(part.name) : named.length === 1 ? named[0] : null;
      const n = part ? Math.max(0, part.count - part.progress) : left;
      const lib = part?.domainId ? view.library?.find((d) => d.id === part.domainId) : undefined;
      return action("REVIEW", { kind: "reveal", target: "week-quests" }, { n, unit: "card", name, geminiNamed: lib ? geminiNamedOf(lib) : false });
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
    if (current.starting) return out;
    // Ruling N27: a locked layer before Start (Start would refuse PREREQS_OPEN): the parent that still lacks cards.
    const parent = lockedParentOf(current);
    if (parent) {
      out.push(...lockedActionsOf(view, parent));
      return out;
    }
    if (view.goalsLive) {
      out.push(action("START", { kind: "sheet", sheet: "start" }, { ord: m.ord }));
      return out;
    }
    // Ruling N28: Start not live: the study is the one action while a topic of the planned layers is left to do.
    const topic = studyTopicOf(view, current);
    out.push(topic ? studyActionOf(topic, fieldOfDomain(view, topic.domainId)) : action("START_LATER", { kind: "none" }));
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
