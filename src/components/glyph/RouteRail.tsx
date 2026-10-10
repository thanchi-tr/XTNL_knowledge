"use client";

/**
 * RouteRail (ui-motion.md §4.5, D18, D29): the milestones as a rail, one
 * state per MilestoneRowState (plus a held node).
 *
 *   reached   a solid ink-0 disc with the cairn (or the rank) cut out in --card
 *   pending   a dashed ring (not yet counted) and the visible words "Reached · counts from Thu"
 *   current   a here-ring with an arc at the measured % (PromiseRing geometry); never a half disc
 *   closed    a struck ring and "Closed at 82% · not reached"
 *   past due  a ring with the kit's i-flag and "Past due"
 *   outline   a thin ring with a [pv.suggest] badge (its «Gemini · not checked» chip sits in the row)
 *   planned / later  a thin ink-mute ring       held  a ring with its HeldGlyph
 *   dropped   a struck thin ring                slipped  a ring and the word "Slipped"
 *
 * Segments: 2 px ink-0 up to the last counted reach, 1 px ink-mute after it, never dashed.
 * Vertical rows are 44 px <details> (▸ holds the date span, the rank it gives, the lines); the strip is
 * a repeat(n, 1fr) grid of 16 px nodes inside 278 px. role=list, one label per node.
 *
 * Motion: `reach` (SEEN) when the counted reached count rose since this viewer last saw it — a pending
 * reach is not counted, so it never plays; `start` (ACT) when `startTick` changes after mount. The
 * current node never pulses.
 *
 * Revision 5, lane 9 (ui-motion.md §15.6, D34, H20): a TOPICS plan's nodes.
 *   layer     layer.k in place of the cairn (`layer`, chainRole LAYER): cut out of a reached disc, small
 *             inside the current node's ring, idle inside a planned ring
 *   locked    PLANNED with `opensAfter`: a thin ink-mute ring, layer.k idle in ink-mute, an m.builds
 *             badge and "after {k}" in ink-2; never m.lock, no dash, no strike. sr "builds on layer k;
 *             opens when milestone k is reached"
 *   held      `heldLayer` (every topic held or skipped): a thin ink-2 ring, layer.k idle, the word
 *             "held"; no rank, no motion; pv.you as a badge when `known` ("you said you know these")
 *   depth     chainRole DEPTH: t.hourglass and «set by reviews»
 *   `layer-open` (SEEN) is queued after `reach` on the node a counted reach opened; never on a skip, a
 *   hold or a locked node. Rows without these fields render exactly as before.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { CHAIN_ORDER, playGlyph, sequence } from "@/lib/glyph-motion";
import type { MilestoneRowState } from "@/lib/roadmap-types";
import { Glyph, Mark, renderPart } from "./Glyph";
import { HonestyChip } from "./HonestyChip";
import { glyphParts } from "./paths";
import { layerGlyphOf, layerParts } from "./paths/layer";
import { circ } from "./paths/part";
import { rankParts } from "./paths/rank";
import { cairn, GATE_PIECES, type StageGate } from "./paths/stage";
import { useSeenEvent, type SeenKey } from "./useSeen";

export type RailState = MilestoneRowState | "HELD";
export const RAIL_STATES: readonly RailState[] = ["REACHED", "PENDING_REACH", "CURRENT", "PLANNED", "OUTLINE", "LATER", "DROPPED", "SLIPPED", "PAST_DUE", "CLOSED_UNREACHED", "HELD"];

export interface RailNode {
  n: number;
  state: RailState;
  /** The node's one accessible label (the row's full words). */
  label: string;
  /** The visible title (vertical rows). */
  title?: ReactNode;
  /** The second line; defaults carry the honest words of pending, closed, past-due and slipped nodes. */
  meta?: ReactNode;
  /** Right-hand figure ("23%"). */
  aside?: ReactNode;
  /** ▸ content: the date span, "gives Aim rank …", the reached date, the state's line. */
  more?: ReactNode;
  /** CURRENT: the measured % (0..100) for the arc. */
  pct?: number | null;
  /** The stage cairn cut out of a reached disc (and drawn inside a pending ring). */
  gate?: StageGate;
  /** A reached node that gave a rank: the rank cut out instead of the cairn. */
  rankIndex?: number | null;
  /** HELD: which HeldGlyph. */
  held?: "freeze" | "rest" | "sick" | "away";
  /** PENDING_REACH: the day it counts from ("Thu"). */
  countsFrom?: string;
  /** CLOSED_UNREACHED: the % it closed at. */
  closedPct?: number | null;
  // ── Revision 5, lane 9 (ui-motion.md §15.6) ──
  /** A TOPICS layer node: layer.k in place of the cairn. */
  layer?: number | null;
  /** LAYER, or DEPTH (a depth milestone: t.hourglass and «set by reviews»). */
  chainRole?: "LAYER" | "DEPTH" | null;
  /** Locked: PLANNED that opens after layer n is reached (m.builds and "after n"; never m.lock, no dash, no strike). */
  opensAfter?: number | null;
  /** Every topic of the layer held or skipped: a thin ink-2 ring, layer.k idle, "held"; no rank, no motion. */
  heldLayer?: boolean;
  /** The layer's topics marked "I know this" by you: pv.you as a badge, sr "you said you know these". */
  known?: boolean;
  /** Not shown yet (the vertical rail's step-by-step disclosure): the row is in the markup with `hidden`. */
  hidden?: boolean;
}

// ── Revision 5, lane 9: the chain's words (roadmap-copy re-exports them; RouteRail is a glyph composite and imports no copy file) ──
/** A locked node's visible word. */
export function afterLayerWord(k: number): string {
  return `after ${k}`;
}
/** A locked node's spoken line. */
export function lockedNodeSr(k: number): string {
  return `builds on layer ${k}; opens when milestone ${k} is reached`;
}
export const HELD_LAYER_WORD = "held";
export const KNOWN_LAYER_SR = "you said you know these";

/** A layer node that a counted reach of the node before it opens (layer-open's target): never locked, held or a depth node. */
export function opensByReach(prev: RailNode | undefined, node: RailNode | undefined): boolean {
  if (!prev || !node) return false;
  return prev.state === "REACHED" && !prev.heldLayer && prev.layer != null && node.layer != null && node.chainRole !== "DEPTH" && !node.opensAfter && !node.heldLayer && (node.state === "CURRENT" || node.state === "PLANNED");
}

/** layer.k drawn inside a node (viewBox 28), in a group so `layer-open` reaches it by its data-g. */
function LayerInNode({ k, scale, cls }: { k: number; scale: number; cls?: string }) {
  const name = layerGlyphOf(k);
  const off = Math.round((14 - 12 * scale) * 1000) / 1000;
  return (
    <g className={cls} data-g={name} transform={`translate(${off} ${off}) scale(${scale})`}>
      {layerParts(name, "idle").map((p, i) => renderPart(p, i))}
    </g>
  );
}

export interface RouteRailProps {
  nodes: readonly RailNode[];
  orientation?: "vertical" | "strip";
  /** The roadmap's seen key for `reach` (its `what` is "reach", shared by every surface). */
  seenKey?: Omit<SeenKey, "what"> | null;
  /** Bump after the user's Start (ACT): the current node's here-ring stamps in, one ping. */
  startTick?: number;
  /** The list's accessible name. */
  label?: string;
  className?: string;
}

const C = (r: number) => circ(14, 14, r);

/** The default visible words a state must carry (§8): the lane may pass its own `meta` (the same words). */
export function railMetaOf(node: RailNode): string | null {
  switch (node.state) {
    case "PENDING_REACH":
      return node.countsFrom ? `Reached · counts from ${node.countsFrom}` : "Reached · not counted yet";
    case "CLOSED_UNREACHED":
      return node.closedPct != null ? `Closed at ${node.closedPct}% · not reached` : "Closed · not reached";
    case "PAST_DUE":
      return "Past due";
    case "SLIPPED":
      return "Slipped";
    default:
      return null;
  }
}

/** Revision 5, lane 9: a TOPICS node's default visible words: "after k" (locked), "held", or «set by reviews» on a depth node. */
export function topicMetaOf(node: RailNode): ReactNode {
  if (node.heldLayer) return <span>{HELD_LAYER_WORD}</span>;
  const after = node.opensAfter ? <span className="mg-rr-after">{afterLayerWord(node.opensAfter)}</span> : null;
  if (node.chainRole === "DEPTH") {
    // the depth milestone line (ui-motion §15.10 row 15: ≤ 6 app words each; «set by reviews» is an honesty label)
    return (
      <span className="mg-rr-dl" data-wc-block="depth-line">
        <HonestyChip kind="schedule" />
        {after}
      </span>
    );
  }
  return after;
}

/** The node's one spoken label: the caller's words, then (revision 5) a locked node's or a known layer's line. */
export function nodeSrOf(node: RailNode): string {
  if (node.opensAfter) return `${node.label} · ${lockedNodeSr(node.opensAfter)}`;
  if (node.heldLayer && node.known) return `${node.label} · ${KNOWN_LAYER_SR}`;
  return node.label;
}

/** The node's SVG body (viewBox 0 0 28 28). */
export function RailNodeBody({ node }: { node: RailNode }) {
  const pieces = node.gate ? GATE_PIECES[node.gate] : 1;
  // ── Revision 5, lane 9: TOPICS nodes (a row without `layer` or `chainRole` never enters these branches) ──
  if (node.chainRole === "DEPTH" && (node.state === "PLANNED" || node.state === "LATER")) {
    return (
      <>
        <path className="mg-rr-thin" d={C(11)} pathLength={100} data-part="rim" />
        <g className={node.opensAfter ? "mg-rr-lm" : "mg-rr-l2"} transform="translate(7 7) scale(.583)">
          {glyphParts("t.hourglass", "idle").map((p, i) => renderPart(p, i))}
        </g>
      </>
    );
  }
  if (node.layer != null && node.heldLayer) {
    return (
      <>
        <path className="mg-rr-held" d={C(11)} pathLength={100} data-part="rim" />
        <LayerInNode k={node.layer} scale={0.583} cls="mg-rr-l2" />
      </>
    );
  }
  if (node.layer != null && (node.state === "PLANNED" || node.state === "LATER")) {
    return (
      <>
        <path className="mg-rr-thin" d={C(11)} pathLength={100} data-part="rim" />
        <LayerInNode k={node.layer} scale={0.583} cls={node.opensAfter ? "mg-rr-lm" : "mg-rr-l2"} />
      </>
    );
  }
  if (node.layer != null && node.state === "REACHED") {
    const name = layerGlyphOf(node.layer);
    return (
      <>
        <path className="mg-rr-disc" d={C(12)} data-part="solid" />
        <g className="mg-rr-in" data-g={name} transform="translate(5 5) scale(.75)">
          {layerParts(name, "idle").map((p, i) => renderPart(p, i))}
        </g>
      </>
    );
  }
  if (node.layer != null && node.state === "CURRENT") {
    const pct = Math.max(0, Math.min(100, Math.round(node.pct ?? 0)));
    return (
      <>
        <path className="mg-rr-here" d={C(12)} pathLength={100} data-part="ring" />
        <path className="mg-rr-track" d={C(8.5)} pathLength={100} data-part="rim" />
        <path className="mg-rr-arc" d={C(8.5)} pathLength={100} strokeDasharray={`${pct} 100`} data-part="mark" />
        <LayerInNode k={node.layer} scale={0.42} />
        <path d={C(12)} pathLength={100} data-part="ping" />
      </>
    );
  }
  switch (node.state) {
    case "REACHED":
      return (
        <>
          <path className="mg-rr-disc" d={C(12)} data-part="solid" />
          <g className="mg-rr-in" transform="translate(5 5) scale(.75)">
            {(node.rankIndex != null ? rankParts(node.rankIndex, "done") : cairn(pieces, null, "idle")).map((p, i) => renderPart(p, i))}
          </g>
        </>
      );
    case "PENDING_REACH":
      return (
        <>
          <path d={C(11.5)} strokeDasharray="4 4" pathLength={100} data-part="rim" />
          <g className="mg-rr-mute" transform="translate(6.5 6.5) scale(.625)">
            {cairn(pieces, null, "idle").map((p, i) => renderPart(p, i))}
          </g>
        </>
      );
    case "CURRENT": {
      const pct = Math.max(0, Math.min(100, Math.round(node.pct ?? 0)));
      return (
        <>
          <path className="mg-rr-here" d={C(12)} pathLength={100} data-part="ring" />
          <path className="mg-rr-track" d={C(8.5)} pathLength={100} data-part="rim" />
          <path className="mg-rr-arc" d={C(8.5)} pathLength={100} strokeDasharray={`${pct} 100`} data-part="mark" />
          <path d={C(12)} pathLength={100} data-part="ping" />
        </>
      );
    }
    case "CLOSED_UNREACHED":
      return (
        <>
          <path className="mg-rr-mute" d={C(11)} pathLength={100} data-part="rim" />
          <path d="M7 21L21 7" pathLength={100} data-part="mark" />
        </>
      );
    case "PAST_DUE":
      return (
        <>
          <path d={C(11)} pathLength={100} data-part="rim" />
          <g transform="translate(7 7) scale(.583)">
            <use href="#i-flag" />
          </g>
        </>
      );
    case "HELD":
      return (
        <>
          <path d={C(11)} pathLength={100} data-part="rim" />
          <g transform="translate(7 7) scale(.583)">
            <use href={`#h-${node.held ?? "freeze"}`} />
          </g>
        </>
      );
    case "DROPPED":
      return (
        <>
          <path className="mg-rr-thin" d={C(11)} pathLength={100} data-part="rim" />
          <path className="mg-rr-mute" d="M7 21L21 7" pathLength={100} data-part="mark" />
        </>
      );
    case "SLIPPED":
      return <path className="mg-rr-mute" d={C(11)} pathLength={100} data-part="rim" />;
    default:
      // PLANNED, LATER, OUTLINE
      return <path className="mg-rr-thin" d={C(11)} pathLength={100} data-part="rim" />;
  }
}

function NodeSvg({ node, size }: { node: RailNode; size: number }) {
  return (
    <svg className="mg-rr-node" data-state={node.state} viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" focusable="false">
      <RailNodeBody node={node} />
    </svg>
  );
}

/** The index of the last counted reach (−1 when none). */
export function lastReachedIndex(nodes: readonly RailNode[]): number {
  let at = -1;
  nodes.forEach((x, i) => {
    if (x.state === "REACHED") at = i;
  });
  return at;
}

export function RouteRail({ nodes, orientation = "vertical", seenKey, startTick, label, className }: RouteRailProps) {
  const ref = useRef<HTMLOListElement>(null);
  const last = lastReachedIndex(nodes);
  const counted = nodes.filter((x) => x.state === "REACHED").length;
  const seen = useSeenEvent(seenKey ? { ...seenKey, what: "reach" } : null, counted, ref, {
    label: last >= 0 ? `milestone ${nodes[last].n} reached` : "reach",
  });
  useEffect(() => {
    if (!seen.changed || seen.from == null || counted <= seen.from || last < 0) return;
    const row = ref.current?.querySelector(`[data-n="${nodes[last].n}"]`);
    if (!row) return;
    const accent = seen.inViewAtHydration;
    sequence({ run: () => playGlyph(row, "reach", { licence: "SEEN", accent }), order: CHAIN_ORDER.reach });
    // Revision 5, lane 9 (H20): the reach opened the next layer — queued after it; never a skip, a hold or a locked node
    const next = nodes[last + 1];
    if (opensByReach(nodes[last], next)) {
      const opened = ref.current?.querySelector(`[data-n="${next.n}"]`);
      if (opened) sequence({ run: () => playGlyph(opened, "layer-open", { licence: "SEEN", accent }), order: CHAIN_ORDER["layer-open"] });
    }
    // the one event per seen change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen.changed]);
  const prevStart = useRef(startTick);
  useEffect(() => {
    if (startTick == null || prevStart.current === startTick) return;
    prevStart.current = startTick;
    const node = ref.current?.querySelector('[data-state="CURRENT"] .mg-rr-node');
    void playGlyph(node, "start", { licence: "ACT" });
  }, [startTick]);

  if (orientation === "strip") {
    const n = nodes.length;
    const onShare = n > 1 && last > 0 ? last / (n - 1) : 0;
    return (
      <ol ref={ref} className={cx("mg-rr", "mg-rr-strip", className)} aria-label={label} style={{ "--rr-n": n } as CSSProperties}>
        <li className="mg-rr-lines" aria-hidden="true">
          <span className="mg-rr-line" />
          {onShare > 0 && <span className="mg-rr-line mg-rr-on" style={{ width: `calc((100% - 100% / ${n}) * ${onShare.toFixed(4)})` }} />}
        </li>
        {nodes.map((x) => (
          <li key={x.n} className="mg-rr-row" data-state={x.state} data-n={x.n}>
            <NodeSvg node={x} size={16} />
            <span className="sr-only">{nodeSrOf(x)}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol ref={ref} className={cx("mg-rr", className)} aria-label={label}>
      {nodes.map((x, i) => {
        const meta = x.meta ?? railMetaOf(x) ?? topicMetaOf(x);
        const head = (
          <>
            <span className="sr-only">{nodeSrOf(x)}</span>
            <span className="mg-rr-n" aria-hidden="true">
              {x.n}
            </span>
            <span className="mg-rr-t" aria-hidden="true">
              {x.title != null && <span className="mg-rr-title">{x.title}</span>}
              {meta != null && <span className="mg-rr-meta">{meta}</span>}
            </span>
            {x.aside != null && (
              <span className="mg-rr-aside" aria-hidden="true">
                {x.aside}
              </span>
            )}
          </>
        );
        return (
          <li key={x.n} className="mg-rr-row" data-state={x.state} data-n={x.n} hidden={x.hidden || undefined}>
            <span className="mg-rr-nw" aria-hidden="true">
              {i > 0 && (
                <svg className="mg-rr-seg mg-rr-up" data-on={i <= last ? "" : undefined} width="2" height="8" focusable="false">
                  <line x1="1" x2="1" y1="0" y2="100%" pathLength={100} data-rr-seg="in" />
                </svg>
              )}
              <NodeSvg node={x} size={28} />
              {x.state === "OUTLINE" && (
                <span className="mg-rr-badge">
                  <Glyph name="pv.suggest" size={12} inherit />
                </span>
              )}
              {/* Revision 5, lane 9: a locked node's m.builds; a known layer's pv.you; an opened layer's resting (hidden) m.builds, which layer-open fades out */}
              {x.state !== "OUTLINE" && x.layer != null && x.opensAfter ? (
                <span className="mg-rr-badge" data-rr-badge="builds">
                  <Glyph name="m.builds" size={12} inherit />
                </span>
              ) : x.state !== "OUTLINE" && x.heldLayer && x.known ? (
                <span className="mg-rr-badge" data-rr-badge="known">
                  <Glyph name="pv.you" size={12} inherit />
                </span>
              ) : x.state !== "OUTLINE" && i > 0 && opensByReach(nodes[i - 1], x) ? (
                <span className="mg-rr-badge mg-rr-lo" data-lo="badge">
                  <Glyph name="m.builds" size={12} inherit />
                </span>
              ) : null}
              {i < nodes.length - 1 && (
                <svg className="mg-rr-seg mg-rr-down" data-on={i + 1 <= last ? "" : undefined} width="2" height="100%" focusable="false">
                  <line x1="1" x2="1" y1="0" y2="100%" pathLength={100} data-rr-seg="out" data-rr-to={nodes[i + 1].n} />
                </svg>
              )}
            </span>
            {x.more != null ? (
              <details className="mg-rr-d">
                <summary>
                  {head}
                  <Mark glyph="i-chev" size={16} className="mg-rr-chev" />
                </summary>
                <div className="mg-rr-more">{x.more}</div>
              </details>
            ) : (
              <div className="mg-rr-flat">{head}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
