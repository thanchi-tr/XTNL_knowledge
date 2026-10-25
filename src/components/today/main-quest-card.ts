/**
 * Today's Main quest card, as words (blueprint 2.1 and 2.2; decisions D11 and D12): the main quest (lib/main-quest
 * mainQuestOf over the Aim card main-quest-server picks), its current milestone, this week's sprint and the one next
 * thing, picked by the roadmap page's own priority (next-action.ts rowActionOf, NEXT_ROW_ORDER) over the sprint's open
 * rows. Pure: no React, no clock, no database (scripts/today-ui-check.ts runs it).
 *
 * Read only, like the strip above it: the card adds no Ask, no count and no row to the board, and a tick is still the
 * board's own. A practice or step row's action is a seek (roadmap-events seekTemplate, the board's own find: it opens
 * the task's place, scrolls to it and flashes it), never a '#t-' link: on Today a same-page hash does nothing once the
 * board has mounted. Start and every plan edit stay on the roadmap page: the card links there, and says "Start
 * milestone n" only while ROADMAP_GOALS_LIVE is on (MainQuest.startable); with the switch off a planned milestone reads
 * "Milestone 1 is planned." and the link is "Open roadmap", unless (ruling N28) the milestone is a planned TOPICS layer
 * with a topic to study (MainQuest.study): then the one action is the study, "Study <topic> · 3 of 8 · 4 due" linking
 * that Domain's review run (roadmap-links reviewRunHref, the Study card's own run), or "Add an idea to <topic>" with no
 * card due in it (the add flow placed in its Domain). Never red, never a verdict: the sprint's share on its
 * Sunday reads "provisional · final Wed 04:00". The milestone's title keeps its provenance (§22.11): its class and its
 * struck numbers travel with it, for the card to draw the chip and the strike.
 */
import type { RoadmapView, WeekQuestRow } from "@/lib/roadmap-types";
import { MAIN_QUEST, milestoneHeadOf, sprintLine, type MainQuest, type MainQuestStudy } from "@/lib/main-quest";
import { NEXT_ROW_ORDER, rowActionOf, studyActionOf } from "@/components/roadmap/next-action";
import { nextActionLabelOf } from "@/components/roadmap/roadmap-copy";
import type { MilestoneTitleView } from "./MilestoneTitle";

/** The card's one action: a link out (with the Domain name inside its label and whether Gemini named it, for the card's pv.named mark: the review round), or a seek for a task on Today (a practice's or a step's row). */
export type MainQuestAction = { label: string; href: string; name?: string; geminiNamed?: boolean } | { label: string; seek: string };

export interface MainQuestCardView {
  heading: typeof MAIN_QUEST;
  /** The heading's aside: "none yet" on the empty card, else null. */
  aside: string | null;
  /** The quest in the user's words; null on the empty card. */
  title: string | null;
  /** "Milestone 2 of 6" and its title, drawn with the title's struck numbers and its chip (Gemini's words carry theirs). */
  milestone: MilestoneTitleView | null;
  /** The quest's one line ("Milestone 1 is planned.", "42% of the way · due Sun 7 Mar"). */
  line: string;
  /** "This week's sprint · 2 of 5 done" (and its Sunday words). */
  sprint: string | null;
  /** The one action: the sprint's next open row, else its roadmap ("Open roadmap", or "Start milestone n" while Start is live), or the planned layer's study (ruling N28). */
  action: MainQuestAction | null;
}

export const OPEN_ROADMAP_WORD = "Open roadmap";
export const SET_MAIN_QUEST_WORD = "Set a main quest";
export const CHECK_DRAFT_WORD = "Check the draft";

const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** A link that stays on Today (/today, /today#t-…): a same-page navigation the mounted board never answers. */
const onToday = (href: string): boolean => href === "/today" || href.startsWith("/today#") || href.startsWith("/today?");

/**
 * The sprint's first open row as the card's action: a practice or step row seeks its task on Today; a row with
 * somewhere else to go links there; a reveal or a sheet is the roadmap page's (its week section, or its Now card).
 */
function sprintActionOf(q: MainQuest, rows: readonly WeekQuestRow[]): MainQuestAction | null {
  const view: Pick<RoadmapView, "library"> = {};
  for (const kind of NEXT_ROW_ORDER) {
    for (const row of rows.filter((r) => r.kind === kind).sort((a, b) => a.ord - b.ord)) {
      const a = rowActionOf(row, view);
      if (!a) continue;
      if ((row.kind === "PRACTICE" || row.kind === "STEP") && row.seekTemplateId && TEMPLATE_ID.test(row.seekTemplateId)) return { label: a.label, seek: row.seekTemplateId };
      if (a.do.kind === "href") return { label: a.label, href: onToday(a.do.href) ? `${q.href}#week-quests` : a.do.href };
      return { label: a.label, href: `${q.href}${a.do.kind === "reveal" ? "#week-quests" : "#now"}` };
    }
  }
  return null;
}

/**
 * Ruling N28: the study as the card's action (next-action studyActionOf: the review run while cards are due, else an idea
 * in its Domain; on a locked layer the lock's parent, "Add n cards to <parent>", the hero's own primary: ruling N27 as the
 * review round reads it), with the Domain name and its Gemini mark for the card to draw.
 */
export function studyMainQuestActionOf(study: MainQuestStudy): { label: string; href: string; name?: string; geminiNamed?: boolean } {
  const a = studyActionOf(study, study.fieldId);
  return { label: a.label, href: a.do.kind === "href" ? a.do.href : "/you/roadmap", ...(a.name ? { name: a.name, geminiNamed: a.geminiNamed === true } : {}) };
}

/**
 * The card for a main quest and its goal's rows this week (main-quest-server loadMainQuestWeek; used only when they
 * are the quest's own sprint). null draws nothing: no quest and the aim suggestions turned off.
 */
export function mainQuestCardOf(q: MainQuest, rows: readonly WeekQuestRow[] | null): MainQuestCardView | null {
  if (q.state === "NONE") {
    if (!q.suggest) return null;
    return { heading: MAIN_QUEST, aside: "none yet", title: null, milestone: null, line: q.line, sprint: null, action: { label: SET_MAIN_QUEST_WORD, href: q.href } };
  }
  const sprint = q.sprint && q.sprint.state !== "PAST_DUE" ? sprintLine(q.sprint) : null;
  let action: MainQuestAction = { label: OPEN_ROADMAP_WORD, href: q.href };
  if (q.state === "DRAFT") action = { label: CHECK_DRAFT_WORD, href: q.href };
  else if (q.state === "PLANNED" && q.startable && q.milestone) action = { label: nextActionLabelOf({ kind: "START", n: null, unit: null, name: null, ord: q.milestone.ord }), href: `${q.href}#now` };
  // Ruling N28: a planned TOPICS layer (locked, or Start off): the study is the one action, the roadmap hero's own words and link.
  else if (q.state === "PLANNED" && q.study) action = studyMainQuestActionOf(q.study);
  else if (q.sprint && q.sprint.state === "OPEN" && rows) action = sprintActionOf(q, rows) ?? action;
  const m = q.milestone;
  const milestone = m ? { head: milestoneHeadOf(m), title: m.title.trim() ? m.title : "", titleClass: m.titleClass, titleStruck: m.titleStruck } : null;
  return { heading: MAIN_QUEST, aside: null, title: q.title, milestone, line: q.line, sprint, action };
}
