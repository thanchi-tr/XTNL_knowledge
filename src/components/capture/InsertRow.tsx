"use client";

import { useEffect, useRef } from "react";
import type { DayKey } from "@/lib/life-day";
import type { ParsedCapture } from "@/lib/life-types";
import type { CaptureAim } from "@/app/actions/capture";
import { Icon } from "@/components/ui/Icon";
import { useMediaQuery } from "./capture-hooks";
import { MENU_NAME, insertChipLabel, insertMenuOptions, insertRowChips, lineHasPrefix, type Insert, type InsertChip, type InsertMenu } from "./capture-ui";

/**
 * The tap-to-add grammar row (capture.md P1), directly above the line.
 *
 * On a phone keyboard every symbol costs a page switch; here a date, a
 * schedule, a Must, an estimate, a goal, the Inbox mark or the idea prefix
 * is one tap. One row of 40 px quiet chips that scrolls sideways and never
 * wraps, so it keeps one row of height on the Fold's cover screen: a ▾ chip
 * swaps the row in place for its options. The opener itself stays, first,
 * as the back chip with aria-expanded="true" (the same element, so a
 * screen reader hears the state change and keyboard focus never lands on a
 * removed node); Escape closes the menu before the sheet. Every chip keeps
 * the line's focus (mousedown is prevented), so the keyboard stays up; the
 * words land at the end of the line (capture-ui applyInsert) and the parser
 * reads them like typed ones. While the row overflows, its edge fades (the
 * scrollbar is hidden), so the chips past the edge are signalled.
 *
 * SuggestRow fills the same slot with suggestions: open goals after '^',
 * tags after '#', or 'Recent' lines on an empty line.
 */

/** A tap on a chip must never take focus from the line (the phone keyboard would drop). */
function keepFocus(e: React.MouseEvent) {
  e.preventDefault();
}

/**
 * Marks a sideways-scrolling row with data-fade="start" | "end" | "both"
 * while chips sit past an edge (capture.css fades that edge). Set on the
 * element directly: nothing renders from it.
 */
function useEdgeFade(ref: React.RefObject<HTMLDivElement | null>, signature: string) {
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    const update = () => {
      const left = row.scrollLeft > 1;
      const right = row.scrollWidth - row.clientWidth - row.scrollLeft > 1;
      const fade = left && right ? "both" : left ? "start" : right ? "end" : null;
      if (fade) row.setAttribute("data-fade", fade);
      else row.removeAttribute("data-fade");
    };
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [ref, signature]);
}

interface InsertRowProps {
  parsed: ParsedCapture;
  text: string;
  today: DayKey;
  goals: { id: string; title: string }[] | null;
  /**
   * The open roadmap (CaptureVocabulary.aim): the Goal ▾ menu offers 'New aim'
   * only once a load has said 'NONE'. The sheet passes nothing while an edit
   * of a saved line is open (an edit stays a task, so an aim line can't open
   * the form there).
   */
  aim?: CaptureAim;
  /** The open ▾ menu, or null for the top row. */
  menu: InsertMenu | null;
  /** A ▾ chip opened a menu, or its back chip (or Escape) closed it. */
  onMenu: (menu: InsertMenu | null) => void;
  /** A chip's words: the sheet adds them and brings the top row back. */
  onInsert: (insert: Insert) => void;
}

export function InsertRow({ parsed, text, today, goals, aim, menu, onMenu, onInsert }: InsertRowProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  /** A keyboard press swapped the row: focus stays on (or returns to) the opener (a mouse or touch keeps it on the line). */
  const keyboardSwap = useRef<{ opener: InsertMenu } | null>(null);
  // The Fold's cover screen: no ▾ glyphs (capture.css) and the one-tap chips first.
  const narrow = useMediaQuery("(max-width: 399px)");

  // A mode the parser read, or a leading 'aim:' (capture-ui lineHasPrefix): no second prefix from the Goal ▾ menu.
  const hasMode = lineHasPrefix(parsed, text);
  const chips: InsertChip[] = menu ? insertMenuOptions(menu, { today, goals, hasMode, aim }) : insertRowChips(parsed, text, { narrow });
  const signature = `${menu ?? ""}|${chips.map((c) => c.id).join(",")}`;
  useEdgeFade(rowRef, signature);

  useEffect(() => {
    const want = keyboardSwap.current;
    if (!want) return;
    keyboardSwap.current = null;
    rowRef.current?.querySelector<HTMLElement>(`[data-menu-opener="${want.opener}"]`)?.focus();
  }, [menu]);

  // A menu (or the row it came from) starts at its first chip.
  useEffect(() => {
    if (rowRef.current) rowRef.current.scrollLeft = 0;
  }, [menu]);

  if (!menu && chips.length === 0) return null;

  const swap = (next: InsertMenu | null, opener: InsertMenu, e: React.MouseEvent) => {
    // A click with no pointer detail came from the keyboard (Enter or Space on the chip).
    if (e.detail === 0) keyboardSwap.current = { opener };
    onMenu(next);
  };

  const onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Escape inside a menu closes the menu, not the sheet (the sheet's Escape layer skips a claimed key).
    if (e.key !== "Escape" || !menu || e.nativeEvent.isComposing) return;
    e.preventDefault();
    keyboardSwap.current = { opener: menu };
    onMenu(null);
  };

  /**
   * A ▾ chip. Expanded, it leads its menu as the back chip. Both forms share
   * one key in the one array below, so React keeps the same element: the
   * screen reader hears aria-expanded change instead of losing a removed node.
   */
  const opener = (opens: InsertMenu, label: string, expanded: boolean) => (
    <button
      key={`opener:${opens}`}
      type="button"
      className="chip btn-chip capture-ins"
      aria-expanded={expanded}
      aria-controls="capture-insert"
      aria-label={expanded ? `${MENU_NAME[opens]} options. Back` : undefined}
      data-menu-opener={opens}
      onMouseDown={keepFocus}
      onClick={(e) => swap(expanded ? null : opens, opens, e)}
    >
      {expanded ? (
        <Icon name="back" />
      ) : (
        <>
          {label}
          <Icon name="chev" className="capture-ins-chev" />
        </>
      )}
    </button>
  );

  const items = chips.map((c) => {
    if (c.eyebrow) {
      return (
        <span key={c.id} className="capture-ins-eyebrow" aria-hidden="true">
          {c.label}
        </span>
      );
    }
    if (c.menu) return opener(c.menu, c.label, false);
    const insert = c.insert;
    // The Idea chip teaches the one-box form: 'idea: Q :: A'.
    const name = c.name ?? (insert ? `${c.label}: ${insertChipLabel(insert)}${insert.text === "idea: " ? " (idea: question :: answer)" : ""}` : c.label);
    return (
      <button
        key={c.id}
        type="button"
        className="chip btn-chip capture-ins"
        disabled={c.disabled || !insert}
        title={name}
        aria-label={name}
        onMouseDown={keepFocus}
        onClick={() => {
          if (insert) onInsert(insert);
        }}
      >
        {c.id === "must" ? <span className="capture-must" aria-hidden="true" /> : null}
        <span className="capture-ins-label">{c.label}</span>
      </button>
    );
  });

  return (
    <div ref={rowRef} id="capture-insert" className="capture-insert" role="group" aria-label="Add to the line" onKeyDown={onRowKeyDown}>
      {menu ? [opener(menu, MENU_NAME[menu], true), ...items] : items}
    </div>
  );
}

export interface Suggestion {
  id: string;
  label: string;
  /** The accessible name: what the tap does. */
  name: string;
  /** What onPick receives: the words to put in the line. */
  value: string;
  disabled?: boolean;
}

/** Suggestions in the insert row's slot: one row, at most six, each a 40 px chip that keeps the line's focus. */
export function SuggestRow({ label, items, onPick }: { label: string; items: Suggestion[]; onPick: (value: string) => void }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEdgeFade(rowRef, `${label}|${items.map((s) => s.id).join(",")}`);
  if (items.length === 0) return null;
  return (
    <div ref={rowRef} className="capture-insert" role="group" aria-label={label}>
      <span className="capture-ins-eyebrow" aria-hidden="true">
        {label}
      </span>
      {items.map((s) => (
        <button
          key={s.id}
          type="button"
          className="chip btn-chip capture-ins"
          disabled={s.disabled}
          title={s.name}
          aria-label={s.name}
          onMouseDown={keepFocus}
          onClick={() => onPick(s.value)}
        >
          <span className="capture-ins-label">{s.label}</span>
        </button>
      ))}
    </div>
  );
}
