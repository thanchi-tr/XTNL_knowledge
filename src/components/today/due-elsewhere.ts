/**
 * Today's one "due elsewhere" strip (the three sections: Ideas, Tasks, Body).
 *
 * Today is the Tasks section: it shows the tasks due today and nothing else.
 * What is due in the other two sections is one slim strip at the top of the
 * board, a row per section, each a link out, glyph-led and word-light
 * (docs/life-plan/ui-motion.md: glyph + figure + a short unit word, the long
 * form a spoken twin, at most ~12 app words at 344 px):
 *
 *   Ideas   [study] 12 reviews · [flag] 1 quest · [sword] boss   → /review
 *   Body    [train] weigh-in                                      → /train
 *
 * Read only from what the page already loads (the board's due count, this
 * week's roadmap quests, the ready encounters, the Body section's day). A
 * section with nothing due has no row; with no row at all the strip is not
 * drawn. Never a count in the nav, never an Ask, never red: due is ink.
 *
 * Pure: no React, no clock, no database (scripts/today-ui-check.ts runs it).
 */

export const IDEAS_HREF = "/review";
export const BODY_HREF = "/train";

export interface ElsewhereInput {
  /** Cards due now (BoardData.dueNow; null when the queue was not read). */
  reviewsDue: number | null;
  /** This life week's roadmap quests still open (an OPEN week, rows not done); 0 without one. */
  questsOpen: number;
  /** Encounters ready to start (on the Ideas landing, where they are started). */
  bossesReady: number;
  /** The Body section's day: weight is tracked (a reading or a target) and nothing is logged today. */
  weighInDue: boolean;
}

export type ElsewhereKind = "reviews" | "quests" | "bosses" | "weigh-in";

export interface ElsewhereItem {
  kind: ElsewhereKind;
  /** The figure drawn beside the glyph; null when the word alone says it ("boss", "weigh-in"). */
  n: number | null;
  /** The short visible word after the figure. */
  word: string;
  /** The spoken twin (D26): the long form a screen reader hears. */
  said: string;
}

export interface ElsewhereRow {
  section: "ideas" | "body";
  href: string;
  /** The section's name, the row's one destination word. */
  label: "Ideas" | "Body";
  items: ElsewhereItem[];
  /** The link's accessible name: "Ideas: 12 reviews due, 1 roadmap quest open this week, 1 boss ready". */
  said: string;
}

const count = (n: number | null | undefined): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** The strip's rows, Ideas first; [] when nothing is due elsewhere (the strip is hidden). */
export function dueElsewhereOf(input: ElsewhereInput): ElsewhereRow[] {
  const rows: ElsewhereRow[] = [];
  const ideas: ElsewhereItem[] = [];
  const reviews = count(input.reviewsDue);
  if (reviews > 0) ideas.push({ kind: "reviews", n: reviews, word: plural(reviews, "review", "reviews"), said: `${reviews} ${plural(reviews, "review", "reviews")} due` });
  const quests = count(input.questsOpen);
  if (quests > 0) ideas.push({ kind: "quests", n: quests, word: plural(quests, "quest", "quests"), said: `${quests} roadmap ${plural(quests, "quest", "quests")} open this week` });
  const bosses = count(input.bossesReady);
  if (bosses > 0)
    ideas.push({ kind: "bosses", n: bosses > 1 ? bosses : null, word: plural(bosses, "boss", "bosses"), said: `${bosses} ${plural(bosses, "boss", "bosses")} ready` });
  if (ideas.length > 0) rows.push({ section: "ideas", href: IDEAS_HREF, label: "Ideas", items: ideas, said: `Ideas: ${ideas.map((i) => i.said).join(", ")}` });
  if (input.weighInDue) {
    const item: ElsewhereItem = { kind: "weigh-in", n: null, word: "weigh-in", said: "no weigh-in yet today" };
    rows.push({ section: "body", href: BODY_HREF, label: "Body", items: [item], said: `Body: ${item.said}` });
  }
  return rows;
}

/**
 * A weigh-in is due today: the player tracks weight (has a reading or a target) and has not logged today. Someone
 * who never weighs in is never asked.
 */
export function weighInDueOf(view: { loggedToday: boolean; latest: unknown; goal: { targetKg: number | null } } | null | undefined): boolean {
  if (!view) return false;
  return !view.loggedToday && (view.latest != null || view.goal.targetKg != null);
}

/** This week's roadmap quests still open: an OPEN week's rows not done (the page passes weekQuestsShownOnToday's view only). */
export function questsOpenOf(view: { total: number; done: number } | null | undefined): number {
  if (!view) return 0;
  return Math.max(0, count(view.total) - count(view.done));
}
