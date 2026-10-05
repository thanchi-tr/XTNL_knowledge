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
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { CHAIN_ORDER, playGlyph, sequence } from "@/lib/glyph-motion";
import type { MilestoneRowState } from "@/lib/roadmap-types";
import { Glyph, Mark, renderPart } from "./Glyph";
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

/** The node's SVG body (viewBox 0 0 28 28). */
export function RailNodeBody({ node }: { node: RailNode }) {
  const pieces = node.gate ? GATE_PIECES[node.gate] : 1;
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
            <span className="sr-only">{x.label}</span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol ref={ref} className={cx("mg-rr", className)} aria-label={label}>
      {nodes.map((x, i) => {
        const meta = x.meta ?? railMetaOf(x);
        const head = (
          <>
            <span className="sr-only">{x.label}</span>
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
          <li key={x.n} className="mg-rr-row" data-state={x.state} data-n={x.n}>
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
