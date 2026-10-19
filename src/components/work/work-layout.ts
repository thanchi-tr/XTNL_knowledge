/**
 * The Office workspace's measured layout (2026-10-20), 344 px first: the numbers work.css draws the agenda row and the
 * header band with, kept here so scripts/scheduled-tasks-check.ts can do the arithmetic (and reads work.css back to
 * see that it uses the same numbers). Pure.
 *
 *   the row     [time 44] [body 1fr] [done 44], gaps 8, the card's row padding 8 each side; the body's action line
 *               holds Call · Text (44 each) and Snooze (its icon and word), gaps 6, wrapping only if it must
 *   the band    [search 1fr] [New] [⋯ 44], gaps 8; the tab's name joins it from 600 (the top bar names it below)
 *   the pages   Agenda · Customers · Orders · Tasks at 14 px semibold, 10 px each side, 2 px apart: they fit 312 px with
 *               no scroll (their counts join them from 600); a page Phase 2 adds scrolls inside the strip, never the page
 */

export const WORK_LAYOUT = {
  /** The narrowest phone the workspace is drawn for. */
  PHONE: 344,
  /** The page's side gutter below 600 (components.css .page). */
  GUTTER: 16,
  /** A row's padding each side, inside its card. */
  ROW_PAD: 8,
  ROW_TIME: 44,
  ROW_DONE: 44,
  ROW_GAP: 8,
  /** Every action and control is a 44 px target. */
  TARGET: 44,
  ACT_GAP: 6,
  /** Snooze: its icon (16), a 4 px gap, the word at 13 px (≤ 46) and 10 px each side. */
  SNOOZE_W: 86,
  /** The band's New button: the plus (18), a 6 px gap, "New" at 14 px (≤ 32) and 12 px each side. */
  NEW_W: 80,
  BAND_GAP: 8,
  /** The narrowest the search field may be. */
  SEARCH_MIN: 140,
  /** A page link in the sub-navigation: its padding each side, the gap between links, and an upper bound on one
   *  character's width at 14 px semibold (Inter's widest lower-case runs about 8). */
  SUB_PAD: 10,
  SUB_GAP: 2,
  SUB_CHAR_W: 8.2,
} as const;

/** The sub-navigation's width for these labels (no counts: they show from 600 only). */
export function subnavWidth(labels: readonly string[]): number {
  const L = WORK_LAYOUT;
  return labels.reduce((w, l) => w + Math.ceil(l.length * L.SUB_CHAR_W) + 2 * L.SUB_PAD, 0) + Math.max(0, labels.length - 1) * L.SUB_GAP;
}

/** The content width at a viewport below 600: the viewport less the page's two gutters. */
export function contentWidth(viewport: number): number {
  return viewport - 2 * WORK_LAYOUT.GUTTER;
}

/** A row's body column at a viewport below 600 (the card has no side padding of its own: the row's is the padding). */
export function rowBodyWidth(viewport: number): number {
  const L = WORK_LAYOUT;
  return contentWidth(viewport) - 2 * L.ROW_PAD - L.ROW_TIME - L.ROW_DONE - 2 * L.ROW_GAP;
}

/** The action line's width with every action (a customer with a phone: Call, Text, Snooze). */
export function actsWidth(withPhone: boolean): number {
  const L = WORK_LAYOUT;
  return withPhone ? L.TARGET + L.TARGET + L.SNOOZE_W + 2 * L.ACT_GAP : L.SNOOZE_W;
}

/** The search field's width in the band at a viewport below 600: the content less New, the menu and two gaps. */
export function bandSearchWidth(viewport: number): number {
  const L = WORK_LAYOUT;
  return contentWidth(viewport) - L.NEW_W - L.TARGET - 2 * L.BAND_GAP;
}
