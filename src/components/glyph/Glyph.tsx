/**
 * Glyphs (ui-motion.md §4.1, §4.5). Server-safe: no hooks, no state. A
 * client component passes `ref` to reach the <svg> for a motion
 * (glyph-motion's playGlyph); nothing here moves on its own.
 *
 *   <Glyph name state? size? label? badge? track? gate? n? struck? defs? inline? inherit? open?/>
 *       <svg class="mg …" data-g data-s viewBox="0 0 24 24">: inline paths for the animatable
 *       families; for a static family in its idle shape, <use href="#gd-{defs}-{name}-idle"> into the
 *       route's GlyphDefs when `defs` names the route (otherwise inline, always correct).
 *   <KindGlyph kind evidence? state track? size?/>   the quest glyph + its evidence badge (+ the done check)
 *   <ProvMark cls/>                                  a glyph-only provenance mark; the exact words sr-only
 *   <GlyphButton glyph label onClick pressed?/>      a 44 px (or 40 px) icon button; no `title`
 *   <Mark glyph/>                                    a glyph or a kit sprite symbol (i-*, s-*, c-*, h-*) in ink
 *
 * A11y: aria-hidden beside a word; role="img" + aria-label when standing alone (`label`).
 * Ink only: no gold, --mp, --xp, --owed or --light (D22).
 */
import type { CSSProperties, ReactElement, Ref } from "react";
import { cx } from "@/components/ui/cx";
import {
  GLYPH_INFO,
  glyphParts,
  resolveGlyph,
  type FlameAlias,
  type GlyphName,
  type GlyphState,
  type Part,
  type StageGate,
  type TrackSigil,
} from "./paths";
import type { EvidenceName } from "./paths/evidence";
import type { ProvMarkName } from "./paths/provenance";
import type { QuestName } from "./paths/quest";
import "./glyph.css";

export type { GlyphName, GlyphState };

// ─── Parts → markup ─────────────────────────────────────────────────────────

/** One part as markup (also used by GlyphDefs for its <symbol>s). */
export function renderPart(p: Part, key: number | string): ReactElement {
  if (p.t === "g") {
    return (
      <g key={key} transform={p.tf}>
        {p.kids.map((k, i) => renderPart(k, i))}
      </g>
    );
  }
  if (p.t === "u") {
    return (
      <use
        key={key}
        href={`#${p.href}`}
        data-part={p.part}
        data-i={p.i}
        className={p.cls}
        fill={p.fill ? "currentColor" : undefined}
        stroke={p.fill ? "none" : undefined}
      />
    );
  }
  const filled = Boolean(p.fill || p.core);
  const cls = cx(p.tone && `mg-c${p.tone}`, p.knock && "mg-k", p.cls);
  return (
    <path
      key={key}
      d={p.d}
      className={cls || undefined}
      data-part={p.part}
      data-i={p.i}
      pathLength={filled ? undefined : 100}
      fill={p.fill || p.fs ? "currentColor" : undefined}
      stroke={filled ? "none" : undefined}
      strokeDasharray={p.dash}
      strokeWidth={p.sw}
    />
  );
}

/** The id of a static glyph's <symbol> in a route's GlyphDefs. */
export function glyphSymbolId(route: string, name: GlyphName, state: GlyphState = "idle"): string {
  return `gd-${route}-${name}-${state}`;
}

// ─── Glyph ──────────────────────────────────────────────────────────────────

export interface GlyphProps {
  name: GlyphName | FlameAlias;
  state?: GlyphState;
  /** px (12 in chips, 16 row leads, 20 KindGlyph / Today rows, 24–28 route nodes, 32 drafting). Default 20. */
  size?: number;
  /** Standing alone: role="img" with these words. Beside a word: leave it out (aria-hidden). */
  label?: string;
  /** A 12 px evidence badge, bottom-right (the glyph is then wrapped in a span). */
  badge?: EvidenceName;
  track?: TrackSigil;
  gate?: StageGate;
  n?: number;
  /** A session glyph struck through: avoided. */
  struck?: boolean;
  /** The route whose GlyphDefs carries the static symbols (rm, you, today …). */
  defs?: string;
  /** Force inline paths (a static glyph a motion must reach, e.g. pv.checked during pv-confirm). */
  inline?: boolean;
  /** Take the colour of the text beside it (chips, labels) instead of the state's ink step. */
  inherit?: boolean;
  /** m.lock: the shackle rests open (its end state after `unlock`). */
  open?: boolean;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<SVGSVGElement>;
}

/** True when this glyph renders as a <use> into GlyphDefs (static family, idle, a route given). */
export function usesDefs(name: GlyphName, state: GlyphState, o: Pick<GlyphProps, "defs" | "inline" | "n">): boolean {
  return Boolean(o.defs && !o.inline && GLYPH_INFO[name].defs && state === "idle" && !(name === "t.cal-moved" && (o.n ?? 1) < 0));
}

export function Glyph(props: GlyphProps) {
  const { size = 20, label, badge, track, gate, n, struck, defs, inline, inherit, open, className, style, ref } = props;
  const { name, state } = resolveGlyph(props.name, props.state ?? "idle");
  const meta = GLYPH_INFO[name];
  const viaDefs = usesDefs(name, state, { defs, inline, n });
  const body = viaDefs ? (
    <>
      <use href={`#${glyphSymbolId(defs!, name, "idle")}`} />
      {struck && <path d="M4.5 19.5L19.5 4.5" data-part="mark" className="mg-strike" pathLength={100} />}
    </>
  ) : (
    glyphParts(name, state, { track, gate, n, struck }).map((p, i) => renderPart(p, i))
  );
  const svg = (
    <svg
      ref={ref}
      className={cx(
        "mg",
        `mg-${meta.family}`,
        `mg-is-${state}`,
        size <= 12 && "mg-z12",
        name === "route.weave" && "mg-weave",
        name.startsWith("intensity.") && "mg-intensity",
        inherit && "mg-inh",
        open && name === "m.lock" && "mg-open",
        className
      )}
      data-g={name}
      data-s={state}
      data-track={name === "quest.practice" ? (track ?? "craft") : undefined}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {body}
    </svg>
  );
  if (!badge) return svg;
  return (
    <span className="mg-bx" style={{ width: size, height: size }}>
      {svg}
      <span className="mg-bdg" aria-hidden="true">
        <Glyph name={badge} size={12} defs={defs} inherit />
      </span>
    </span>
  );
}

// ─── Mark: a glyph or a kit symbol, in ink ──────────────────────────────────

export type KitRef =
  | `i-${"gear" | "lock" | "check" | "clock" | "flag" | "share" | "plus" | "chev" | "x" | "dot3" | "study" | "flame"}`
  | `s-${TrackSigil}`
  | `c-${"xp" | "pts" | "mp"}`
  | `h-${"freeze" | "rest" | "sick" | "away"}`;
export type MarkRef = GlyphName | FlameAlias | KitRef;

export function isKitRef(v: string): v is KitRef {
  return /^[isch]-/.test(v) && !v.includes(".");
}

/** A glyph, or a kit sprite symbol drawn in the text's ink (c-mp included: ink only on roadmap surfaces, D22). */
export function Mark({ glyph, state, size = 16, defs, track, className }: { glyph: MarkRef; state?: GlyphState; size?: number; defs?: string; track?: TrackSigil; className?: string }) {
  if (isKitRef(glyph)) {
    return (
      <svg className={cx("mg", "mg-kit", "mg-inh", size <= 12 && "mg-z12", className)} data-g={glyph} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
        <use href={`#${glyph}`} />
      </svg>
    );
  }
  return <Glyph name={glyph} state={state} size={size} defs={defs} track={track} inherit className={className} />;
}

// ─── KindGlyph ──────────────────────────────────────────────────────────────

export type QuestKind = "raise" | "add" | "practice" | "step" | "checkpoint";
export const QUEST_KINDS: readonly QuestKind[] = ["raise", "add", "practice", "step", "checkpoint"];
export const KIND_GLYPH: Readonly<Record<QuestKind, QuestName>> = {
  raise: "quest.bring",
  add: "quest.add",
  practice: "quest.practice",
  step: "quest.step",
  checkpoint: "quest.checkpoint",
};
export const KIND_EVIDENCE: Readonly<Record<QuestKind, EvidenceName>> = {
  raise: "ev.tested",
  add: "ev.counted",
  practice: "ev.tick",
  step: "ev.tick",
  checkpoint: "ev.log",
};
/** Each kind's evidence caption: the same words as roadmap-copy WEEK_QUEST_CAPTIONS (glyph-check asserts it). */
export const KIND_WORDS: Readonly<Record<QuestKind, string>> = {
  raise: "tested by your reviews",
  add: "counted by the app; it doesn't judge them",
  practice: "from your ticks",
  step: "you tick it",
  checkpoint: "you log it · doesn't move your progress",
};
/** The done badge's check (KindGlyph's top-right; quest-done draws it). */
const OK_CHECK = "M6 12.5l4 4 8-8.5";

export interface KindGlyphProps {
  kind: QuestKind;
  /** The plan's own track sigil (quest.practice). */
  track?: TrackSigil;
  /** The evidence badge; defaults to the kind's own class. */
  evidence?: EvidenceName;
  state?: GlyphState;
  size?: number;
  /** The sr words; default the kind's caption. */
  words?: string;
  defs?: string;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

/** The quest glyph with its evidence badge (bottom-right) and, when done, the check badge (top-right). */
export function KindGlyph({ kind, track, evidence, state = "idle", size = 20, words, defs, className, ref }: KindGlyphProps) {
  return (
    <span ref={ref} className={cx("mg-kg", size >= 28 && "mg-kg-l", className)} data-kg={kind} data-s={state} style={{ width: size, height: size }}>
      <Glyph name={KIND_GLYPH[kind]} state={state} track={track} size={size} />
      <span className="mg-kg-b mg-kg-ev" aria-hidden="true">
        <Glyph name={evidence ?? KIND_EVIDENCE[kind]} size={12} defs={defs} inherit />
      </span>
      {state === "done" && (
        <span className="mg-kg-b mg-kg-ok" aria-hidden="true">
          <svg className="mg mg-ok mg-z12" viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" focusable="false">
            <path d={OK_CHECK} data-part="mark" pathLength={100} />
          </svg>
        </span>
      )}
      <span className="sr-only">{words ?? KIND_WORDS[kind]}</span>
    </span>
  );
}

// ─── ProvMark ───────────────────────────────────────────────────────────────

export type ProvMarkClass = "app-written" | "app-added" | "app-worked" | "you" | "checked" | "syllabus";
/** The exact current words (roadmap-copy provenanceChipWords / PROVENANCE_WORDS; glyph-check asserts they match). */
export const PROVMARK_WORDS: Readonly<Record<ProvMarkClass, string>> = {
  "app-written": "Written by the app",
  "app-added": "added by the app",
  "app-worked": "worked out by the app",
  you: "You wrote this",
  checked: "You checked this",
  syllabus: "Your syllabus line",
};
export const PROVMARK_GLYPH: Readonly<Record<ProvMarkClass, ProvMarkName>> = {
  "app-written": "pv.app",
  "app-added": "pv.app",
  "app-worked": "pv.app",
  you: "pv.you",
  checked: "pv.checked",
  syllabus: "pv.syllabus",
};

export interface ProvMarkProps {
  cls: ProvMarkClass;
  /** Override the sr words (only to pass the current constant). */
  words?: string;
  size?: number;
  defs?: string;
  /** Inline paths so pv-confirm can draw the rim and the check (the "I checked this" act). */
  confirming?: boolean;
  className?: string;
  ref?: Ref<HTMLSpanElement>;
}

/** Glyph-only provenance: the glyph aria-hidden, the exact words sr-only, read once. No `title`. */
export function ProvMark({ cls, words, size = 16, defs, confirming, className, ref }: ProvMarkProps) {
  return (
    <span ref={ref} className={cx("mg-pm", className)} data-pm={cls}>
      <Glyph name={PROVMARK_GLYPH[cls]} size={size} defs={defs} inline={confirming} inherit />
      <span className="sr-only">{words ?? PROVMARK_WORDS[cls]}</span>
    </span>
  );
}

// ─── GlyphButton (moved from RoadmapGlyph) ──────────────────────────────────

export interface GlyphButtonProps {
  glyph: GlyphName;
  /** The button's accessible name (aria-label). Never a `title`. */
  label: string;
  onClick?: () => void;
  /** A toggle (the WAIT pause button): aria-pressed. */
  pressed?: boolean;
  /** 44 (default) or 40. */
  size?: 40 | 44;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

export function GlyphButton({ glyph, label, onClick, pressed, size = 44, className, ref }: GlyphButtonProps) {
  return (
    <button ref={ref} type="button" className={cx("icon-btn", "mg-gb", size === 40 && "mg-gb-40", className)} aria-label={label} aria-pressed={pressed} onClick={onClick}>
      <Glyph name={glyph} inherit />
    </button>
  );
}
