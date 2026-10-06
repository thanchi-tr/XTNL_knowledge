"use client";

/**
 * One layer of the topic map (roadmap revision 5, lane 9; ui-motion.md §15.5,
 * D35–D37, H20; contracts §22.11).
 *
 *   header row 1 (44 px)  [layer.k 16] Layer 2 · after 1 · 5        [i-plus 40][keep 40]
 *                         layer.k: active on the open layer, done when reached, ink-mute when locked;
 *                         the figure is the layer's chosen count; [Keep these] is the 40 px glyph button
 *                         (pv.kept, "Keep layer k"; its words in the card Key, D36). Once kept: a static
 *                         pv.kept mark, sr "Layer k kept". [Write a topic] (i-plus) on a draft.
 *   header row 2          the one who-word chip (D37; a 24 px visual in a 40 px box: 84 px in all), and
 *                         "[i-flag] 2 need a parent" while any does (it blocks the keep)
 *   rows                  TopicMapRow, chosen first
 *   folds                 "+3" (unchosen, never struck; sr "3 more topics, not in the plan") and
 *                         [pv.suggest] "2" «Gemini · not checked» (sr "2 not checked"); a tap reveals
 *   empty                 the state word "empty" and a ▸ to the empty-layer sheet
 *
 * App words per layer (header and folds; numerals are figures): at most 6 (ui-motion §15.10 row 13).
 * Motion: `layer-open` (SEEN) on the header when this viewer last saw the layer locked and a counted reach
 * of the layer above opened it (H20: never on a skip, a hold, a closed-unreached milestone).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { Glyph, GlyphButton, Mark } from "@/components/glyph/Glyph";
import type { MarkRef } from "@/components/glyph/Glyph";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { layerGlyphOf } from "@/components/glyph/paths/layer";
import { usePlayOnSeen, type SeenKey } from "@/components/glyph/useSeen";
import { playGlyph } from "@/lib/glyph-motion";
import type { TopicLayerView, TopicMapView, TopicRowView } from "@/lib/roadmap-types";
import {
  GEMINI_KEPT_BY_YOU_FULL,
  GEMINI_KEPT_NOT_CHECKED_FULL,
  GEMINI_LINKED_FULL,
  GEMINI_LINKED_ONE_FULL,
  GEMINI_NOT_CHECKED_FULL,
  GEMINI_PICKED_DOMAIN_FULL,
  GEMINI_PLACED_FULL,
  emptyLayerAria,
  layerChosenSr,
  foldHiddenSr,
  foldMoreSr,
  keepLayerAria,
  layerKeptSr,
  layerStateWord,
  layerWord,
  needsParentLine,
  writeTopicAria,
} from "./roadmap-copy";
import { layerChipOf, parentNamesOf } from "./topic-map-model";
import { TopicMapRow, type TraceRole } from "./TopicMapRow";

export interface LayerBandProps {
  map: Pick<TopicMapView, "layers">;
  layer: TopicLayerView;
  /** A draft: [Keep these], [Write a topic], the checkboxes and the empty-layer sheet. */
  draft: boolean;
  trace: { self: string | null; related: Set<string> };
  onTrace: (key: string) => void;
  onChoose?: ((key: string, chosen: boolean) => void) | null;
  onMore: (key: string) => void;
  onKeep?: ((layer: number) => void) | null;
  onWrite?: ((layer: number) => void) | null;
  onEmpty?: ((layer: number) => void) | null;
  /** The seen key's roadmap and basis for `layer-open` (its `what` is "layer:{k}"). */
  seenKey?: Omit<SeenKey, "what"> | null;
  /** The layer above was reached and counted (not held or skipped): a rise of this layer to open plays layer-open. */
  openedByReach?: boolean;
  /** The hidden fold, controlled (the empty-layer sheet's [Show the not-checked ones] opens it); uncontrolled when absent. */
  hiddenOpen?: boolean;
  onHiddenToggle?: (layer: number) => void;
  /** Seeds and clauses rendered after the rows (the no-Gemini path). */
  children?: ReactNode;
  pending?: boolean;
}

const CHIP_FULL: Readonly<Record<string, string>> = {
  "gemini-linked": GEMINI_LINKED_FULL,
  "gemini-linked-one": GEMINI_LINKED_ONE_FULL,
  "gemini-placed": GEMINI_PLACED_FULL,
  "gemini-picked-domain": GEMINI_PICKED_DOMAIN_FULL,
  "gemini-kept-by-you": GEMINI_KEPT_BY_YOU_FULL,
  "gemini-kept": GEMINI_KEPT_NOT_CHECKED_FULL,
};

/** A 40 px glyph button for a kit symbol or a glyph (GlyphButton takes glyphs only): [Write a topic] is i-plus. */
export function MarkButton({ glyph, label, onClick, className }: { glyph: MarkRef; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={cx("icon-btn", "mg-gb", "mg-gb-40", className)} aria-label={label} onClick={onClick}>
      <Mark glyph={glyph} size={20} />
    </button>
  );
}

function roleOf(trace: LayerBandProps["trace"], key: string): TraceRole {
  if (!trace.self) return null;
  if (trace.self === key) return "self";
  return trace.related.has(key) ? "rel" : "other";
}

export function LayerBand({ map, layer, draft, trace, onTrace, onChoose, onMore, onKeep, onWrite, onEmpty, seenKey, openedByReach, hiddenOpen, onHiddenToggle, children, pending }: LayerBandProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = useState(false);
  const [hiddenLocal, setHiddenLocal] = useState(false);
  const showHidden = hiddenOpen ?? hiddenLocal;
  const toggleHidden = () => (onHiddenToggle ? onHiddenToggle(layer.layer) : setHiddenLocal((v) => !v));
  const k = layer.layer;
  const empty = layer.emptyOffers != null;
  const locked = layer.state === "AFTER";
  const glyphState = layer.state === "OPEN" ? "active" : layer.state === "DONE" ? "done" : "idle";
  const notChecked = layer.topics.filter((r) => r.cls === "NOT_CHECKED");
  const chosen = layer.topics.filter((r) => r.chosen && r.cls !== "NOT_CHECKED");
  const unchosen = layer.topics.filter((r) => !r.chosen && r.cls !== "NOT_CHECKED");
  const hiddenCount = Math.max(layer.hidden, notChecked.length);
  const moreCount = Math.max(layer.unchosen, unchosen.length);
  const chip = layer.geminiNames ? layerChipOf(layer) : null;
  usePlayOnSeen(ref, seenKey ? { ...seenKey, what: `layer:${k}` } : null, layer.state === "OPEN" ? 1 : 0, "layer-open", {
    when: (from, to) => openedByReach === true && from === 0 && to === 1,
    text: layerStateWord("OPEN", k),
  });
  // [Keep these] (ACT): the swap form of pv-confirm on the kept mark once the user's keep lands (H3: no balloon draws)
  const keptRef = useRef<HTMLSpanElement>(null);
  const wasKept = useRef(layer.kept);
  useEffect(() => {
    if (!wasKept.current && layer.kept) void playGlyph(keptRef.current?.querySelector("svg"), "pv-confirm", { licence: "ACT" });
    wasKept.current = layer.kept;
  }, [layer.kept]);
  const row = (r: TopicRowView) => (
    <TopicMapRow key={r.key} row={r} parents={parentNamesOf(map, r)} trace={roleOf(trace, r.key)} onTrace={onTrace} onChoose={draft ? onChoose : null} onMore={onMore} pending={pending} />
  );
  return (
    <section className={cx("rm-tm-band", locked && "rm-tm-locked")} data-layer={k} data-state={layer.state} data-kept={layer.kept ? "" : undefined} aria-labelledby={`rm-tm-h-${k}`}>
      <div ref={ref} className="rm-tm-hd" data-wc-block="topic-layer">
        <div className="rm-tm-h1">
          <Glyph name={layerGlyphOf(k)} state={glyphState} size={16} className={locked ? "mg-lk" : undefined} />
          <h3 id={`rm-tm-h-${k}`} className="rm-tm-ht">
            {layerWord(k)}
          </h3>
          <span className="rm-tm-sw" data-lo="word">
            {layerStateWord(layer.state, k, empty)}
          </span>
          {!empty && (
            <span className="rm-tm-n">
              <span aria-hidden="true">{chosen.length}</span>
              <span className="sr-only">{layerChosenSr(chosen.length)}</span>
            </span>
          )}
          <span className="rm-tm-hacts">
            {draft && onWrite && <MarkButton glyph="i-plus" label={writeTopicAria(k)} onClick={() => onWrite(k)} className="rm-tm-write" />}
            {empty && onEmpty && (
              <button type="button" className="rm-tm-more" aria-label={emptyLayerAria(k)} onClick={() => onEmpty(k)}>
                <Mark glyph="i-chev" size={16} />
              </button>
            )}
            {/* An empty band (no shown topic) has nothing to keep: its ▸ offers the ways out (merge, write one, the not-checked names). */}
            {draft && !layer.kept && !empty && onKeep && <GlyphButton glyph="pv.kept" size={40} label={keepLayerAria(k)} onClick={() => onKeep(k)} className="rm-tm-keep" />}
            {draft && layer.kept && (
              <span ref={keptRef} className="rm-tm-kept">
                <Glyph name="pv.kept" size={20} inherit />
                <span className="sr-only">{layerKeptSr(k)}</span>
              </span>
            )}
          </span>
        </div>
        {(chip || layer.needsParent > 0) && (
          <div className="rm-tm-h2">
            {chip && <HonestyChip kind={chip.kind} label={chip.label} full={CHIP_FULL[chip.kind] ?? GEMINI_NOT_CHECKED_FULL} />}
            {layer.needsParent > 0 && (
              <span className="rm-tm-np">
                <Mark glyph="i-flag" size={12} />
                <span>{needsParentLine(layer.needsParent)}</span>
              </span>
            )}
          </div>
        )}
        {moreCount > 0 && (
          <button type="button" className="rm-tm-fold" aria-expanded={showMore} onClick={() => setShowMore((v) => !v)}>
            <Mark glyph="i-plus" size={16} />
            <span aria-hidden="true">+{moreCount}</span>
            <span className="sr-only">{foldMoreSr(moreCount)}</span>
          </button>
        )}
        {hiddenCount > 0 && (
          <div className="rm-tm-fold rm-tm-fold-h">
            <button type="button" className="rm-tm-foldb" aria-expanded={showHidden} onClick={toggleHidden}>
              <Mark glyph="pv.suggest" size={16} />
              <span aria-hidden="true">{hiddenCount}</span>
              <span className="sr-only">{foldHiddenSr(hiddenCount)}</span>
            </button>
            {/* the fold's who-word chip is a button: its full words one tap away on the card (D13; ui-motion §15.3) */}
            <HonestyChip kind="gemini" full={GEMINI_NOT_CHECKED_FULL} />
          </div>
        )}
      </div>
      {chosen.length > 0 && <ul className="rm-tm-rows">{chosen.map(row)}</ul>}
      {showMore && unchosen.length > 0 && <ul className="rm-tm-rows rm-tm-rows-more">{unchosen.map(row)}</ul>}
      {showHidden && notChecked.length > 0 && <ul className="rm-tm-rows rm-tm-rows-hidden">{notChecked.map(row)}</ul>}
      {children}
    </section>
  );
}
