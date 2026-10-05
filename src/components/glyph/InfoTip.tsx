"use client";

/**
 * InfoTip, CardKey and the chip disclosure (ui-motion.md §4.5, D13, D31).
 *
 *   <InfoTip topic id? describes? variant?>{full text}</InfoTip>
 *       A 40 × 40 button (the m.info glyph), aria-label "About {topic}", aria-expanded,
 *       aria-controls → the panel. The panel is in server markup with `hidden`, right after the
 *       button in DOM order, and opens full width under the button's row (13/18, ink-1).
 *       `describes`: the id of the control it explains; that control gets aria-describedby → the
 *       panel (a description works while the panel is hidden). Escape closes it and returns focus.
 *       At most 3 per card, the Key included.
 *   <CardKey entries rows?/>   variant "key": each glyph used in the card with its words, and every
 *                              per-row sr string of the card (D13: the touch twin of sr text).
 *   <ChipButton …/>            HonestyChip's `full` mode: the chip is the button, the full string the panel.
 *
 * Opening plays tip-open (ACT, 160 ms opacity) through glyph-motion; on a safety surface
 * ([data-safety]) it opens instantly. No `title` anywhere.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { playGlyph } from "@/lib/glyph-motion";
import { Glyph, Mark, type GlyphState, type MarkRef } from "./Glyph";
import type { TrackSigil } from "./paths";

/** Adds a panel id to a control's aria-describedby, token-merged; returns the undo. Exported for the checks. */
export function wireDescribedBy(target: Element | null, id: string): () => void {
  if (!target) return () => undefined;
  const before = target.getAttribute("aria-describedby");
  const tokens = (before ?? "").split(/\s+/).filter(Boolean);
  if (tokens.includes(id)) return () => undefined;
  target.setAttribute("aria-describedby", [...tokens, id].join(" "));
  return () => {
    const now = (target.getAttribute("aria-describedby") ?? "").split(/\s+/).filter((t) => t && t !== id);
    if (now.length) target.setAttribute("aria-describedby", now.join(" "));
    else target.removeAttribute("aria-describedby");
  };
}

function useDisclosure(id?: string) {
  const auto = useId();
  const panelId = id ?? `mg-tp${auto}`;
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // ACT: the user's own tap opened it (closed on mount, so this never runs on arrival)
    if (open) void playGlyph(panelRef.current, "tip-open", { licence: "ACT" });
  }, [open]);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    }
  };
  return { panelId, open, toggle: () => setOpen((o) => !o), btnRef, panelRef, onKeyDown };
}

// ─── InfoTip ────────────────────────────────────────────────────────────────

export interface InfoTipProps {
  /** "About {topic}" is the button's name. */
  topic: string;
  variant?: "info" | "key";
  /** The panel's id (stable across server and client when given). */
  id?: string;
  /** The id of the control this explains: it gets aria-describedby → the panel. */
  describes?: string;
  children: ReactNode;
  className?: string;
}

export function InfoTip({ topic, variant = "info", id, describes, children, className }: InfoTipProps) {
  const { panelId, open, toggle, btnRef, panelRef, onKeyDown } = useDisclosure(id);
  useLayoutEffect(() => {
    if (!describes) return;
    return wireDescribedBy(document.getElementById(describes), panelId);
  }, [describes, panelId]);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cx("mg-tip", className)}
        data-tip={variant}
        aria-label={`About ${topic}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <Glyph name="m.info" inherit />
      </button>
      <span ref={panelRef} id={panelId} className="mg-tp" data-tip-panel={variant} hidden={!open} onKeyDown={onKeyDown}>
        {children}
      </span>
    </>
  );
}

// ─── CardKey ────────────────────────────────────────────────────────────────

export interface KeyEntry {
  glyph?: MarkRef;
  state?: GlyphState;
  track?: TrackSigil;
  /** The glyph's words, or a per-row line. */
  words: ReactNode;
}

export interface CardKeyProps {
  /** Each glyph used in the card, with its words. */
  entries: readonly KeyEntry[];
  /** Every per-row sr-only string of the card, so a touch user can read it (D13). */
  rows?: readonly ReactNode[];
  topic?: string;
  id?: string;
  defs?: string;
  /** Lines before the list (a moved hint, the card's explanations folded in). */
  children?: ReactNode;
}

export function CardKey({ entries, rows, topic = "the marks on this card", id, defs, children }: CardKeyProps) {
  return (
    <InfoTip topic={topic} variant="key" id={id}>
      {children}
      {/* Spans with list roles, not <ul>: the key sits inside an inline panel that may itself sit in a <p>,
          and a block list there is invalid HTML (a hydration error). */}
      <span className="mg-key" role="list">
        {entries.map((e, i) => (
          <span key={i} className="mg-key-i" role="listitem">
            <span className="mg-key-g" aria-hidden="true">
              {e.glyph ? <Mark glyph={e.glyph} state={e.state} track={e.track} size={16} defs={defs} /> : null}
            </span>
            <span>{e.words}</span>
          </span>
        ))}
      </span>
      {rows && rows.length > 0 && (
        <span className="mg-key-rows" role="list">
          {rows.map((r, i) => (
            <span key={i} className="mg-key-r" role="listitem">
              {r}
            </span>
          ))}
        </span>
      )}
    </InfoTip>
  );
}

// ─── ChipButton (HonestyChip with `full`) ───────────────────────────────────

export interface ChipButtonProps {
  kind: string;
  glyph: ReactNode;
  label: string;
  full: ReactNode;
  id?: string;
  wrap?: boolean;
  className?: string;
}

export function ChipButton({ kind, glyph, label, full, id, wrap, className }: ChipButtonProps) {
  const { panelId, open, toggle, btnRef, panelRef, onKeyDown } = useDisclosure(id);
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={cx("mg-hcb", className)}
        data-hc={kind}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        onKeyDown={onKeyDown}
      >
        <span className={cx("chip", "mg-hc", wrap && "mg-wrap")}>
          <span aria-hidden="true" style={{ display: "contents" }}>
            {glyph}
          </span>
          <span className="mg-hc-l" data-wc="honest">
            {label}
          </span>
        </span>
      </button>
      <span ref={panelRef} id={panelId} className="mg-tp" data-hc-panel={kind} hidden={!open} onKeyDown={onKeyDown}>
        {full}
      </span>
    </>
  );
}
