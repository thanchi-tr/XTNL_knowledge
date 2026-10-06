/**
 * HonestyChip and VerdictChip (ui-motion.md §4.6, D12, D13, D25, D28, D31).
 * Server-safe; a chip with `full` renders the client ChipButton.
 *
 *   <HonestyChip kind label? sr? full? id?/>
 *     Every kind keeps a visible word; "Gemini" stays visible on every Gemini kind (D25).
 *     Without `full`: a static chip — its glyph and short label aria-hidden, the full string
 *       sr-only, read exactly once; not focusable; no `title`.
 *     With `full`: a <button> with a real 40 × 40 box (min-height and min-width 40, negative block
 *       margins of 8 px: the .rm-ilink pattern), aria-expanded, aria-controls → the panel right
 *       after it in DOM order, holding the full text.
 *     No dashed rim on any chip: estimates use ≈; "not checked" is the balloon glyph (D29).
 *     Visible labels are the SHORT_* constants (R0); the defaults below are the same words.
 *   <VerdictChip verdict unverified? chosen?/>   a verdict glyph only ever sits here (D27), with its
 *     word from verdictWordOf (roadmap-copy verdictWord's rule): "Unverified · Fits" adds v.unv.
 *   <Chips>…</Chips>                              a chip row: column gap 8, row gap 16 (no two 40 px boxes meet)
 */
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { speakFigure } from "@/lib/figure-speech";
import { Glyph, Mark, type MarkRef } from "./Glyph";
import { ChipButton } from "./InfoTip";
import type { VerdictName } from "./paths/verdict";

export type HonestyKind =
  | "gemini"
  | "gemini-kept"
  | "gemini-pick"
  | "integrity"
  | "constraints"
  | "credential"
  | "arrangement"
  | "sized-by-gemini"
  | "edit-numbers"
  | "health"
  | "data"
  | "no-key"
  | "policy"
  | "judge"
  | "schedule"
  | "aim-unchecked"
  | "unverified"
  | "best-case"
  | "calibrating"
  | "estimate"
  | "review-gap"
  | "not-timed"
  | "reads-high"
  | "pays-nothing"
  | "pays-nothing-ms"
  | "from-70"
  | "at-acceptance"
  | "context-only"
  | "over"
  | "lowered"
  | "behind"
  | "rests-on-added"
  | "clash"
  | "live"
  | "not-recorded"
  | "library-unchecked"
  | "legacy"
  // ── Revision 5, lane 9 (ui-motion.md §15.3; contracts §22.11) ──
  | "gemini-linked"
  // ruling N3 (contracts §22.20, the names test): a Gemini name Google linked to exactly 1 source, shown on the map
  | "gemini-linked-one"
  | "gemini-placed"
  | "gemini-picked-domain"
  | "gemini-kept-by-you"
  | "estimate-gemini"
  | "estimate-unsure"
  | "estimate-app"
  | "caution-financial"
  | "caution-medical"
  | "caution-legal";

export interface HonestyKindDef {
  glyph: MarkRef | null;
  /** The visible label (the SHORT_* words); a kind marked verbatim passes its own. */
  label: string;
  /** Whether the kind is a button (opens its full text) in §4.6. */
  button: boolean;
  /** A static kind's sr string when it is a fixed constant (roadmap-copy); otherwise the label in words. */
  sr?: string;
  /** The label is a constant passed verbatim by the caller (integrityLine). */
  verbatim?: boolean;
}

/** §4.6, one row per kind. */
export const HONESTY_KINDS: Readonly<Record<HonestyKind, HonestyKindDef>> = {
  gemini: { glyph: "pv.suggest", label: "Gemini · not checked", button: false, sr: "Gemini suggestion · not checked" },
  "gemini-kept": { glyph: "pv.kept", label: "Gemini · kept · not checked", button: false, sr: "Gemini's words · kept by you · not checked" },
  "gemini-pick": { glyph: "pv.pick", label: "Gemini's choice · not checked", button: false, sr: "Gemini's choice among the app's options" },
  integrity: { glyph: "pv.integrity", label: "Gemini's reply: keys only · 0 words of its own", button: true, verbatim: true },
  constraints: { glyph: "pv.suggest", label: "Shown to Gemini · not checked", button: true },
  credential: { glyph: "pv.suggest", label: "Gemini's guess", button: true },
  arrangement: { glyph: "pv.suggest", label: "Gemini's order", button: true },
  "sized-by-gemini": { glyph: "pv.suggest", label: "sized by Gemini", button: true },
  "edit-numbers": { glyph: "pv.you", label: "your numbers · Gemini's words", button: true },
  health: { glyph: "safe.health", label: "Not medical advice · ask a professional", button: true },
  data: { glyph: "i-share", label: "Google may use this", button: true },
  "no-key": { glyph: "pv.app", label: "from your numbers", button: true },
  policy: { glyph: "m.policy", label: "App policy", button: true },
  judge: { glyph: "m.judge", label: "yours to judge", button: true },
  schedule: { glyph: "t.hourglass", label: "set by reviews", button: true },
  "aim-unchecked": { glyph: "v.unv", label: "Aim not checked", button: true },
  unverified: { glyph: "v.unv", label: "Unverified", button: false },
  "best-case": { glyph: "ev.estimate", label: "best case", button: false, sr: "best case — your pass rate is still calibrating" },
  calibrating: { glyph: "ev.tested", label: "pass rate calibrating", button: false },
  estimate: { glyph: null, label: "≈", button: false, sr: "about" },
  "review-gap": { glyph: "t.span", label: "review gap", button: false },
  "not-timed": { glyph: "ev.estimate", label: "not timed", button: false },
  "reads-high": { glyph: "ev.estimate", label: "reads high", button: false },
  "pays-nothing": { glyph: "m.nopay", label: "pays nothing", button: false },
  "pays-nothing-ms": { glyph: "m.nopay", label: "pays nothing", button: true },
  "from-70": { glyph: "c-mp", label: "from 70%", button: false },
  "at-acceptance": { glyph: "ev.measured", label: "at acceptance", button: true },
  "context-only": { glyph: "quest.checkpoint", label: "context only", button: false, sr: "you log it · doesn't move your progress" },
  over: { glyph: "v.over", label: "Over", button: false },
  lowered: { glyph: "m.down", label: "Target lowered", button: false },
  behind: { glyph: "pace.behind", label: "Behind", button: true },
  "rests-on-added": { glyph: "pv.app", label: "rests on an added practice", button: true },
  clash: { glyph: "m.clash", label: "May clash with your aim", button: true },
  live: { glyph: "m.info", label: "writes off", button: true },
  "not-recorded": { glyph: "m.info", label: "not recorded here", button: true },
  "library-unchecked": { glyph: "v.unv", label: "library not checked", button: true },
  legacy: { glyph: "m.info", label: "older plan", button: true },
  // ── Revision 5, lane 9 (ui-motion.md §15.3). The labels are roadmap-copy's (callers pass the figure-bearing ones). ──
  "gemini-linked": { glyph: "pv.web", label: "Gemini · Google linked 2 sources", button: true },
  "gemini-linked-one": { glyph: "pv.web", label: "Gemini · Google linked 1 source", button: true },
  "gemini-placed": { glyph: "pv.suggest", label: "Gemini placed it · not checked", button: true },
  "gemini-picked-domain": { glyph: "pv.libpick", label: "Gemini picked your Domain · not checked", button: true },
  "gemini-kept-by-you": { glyph: "pv.kept", label: "Gemini · kept by you", button: true },
  "estimate-gemini": { glyph: "pv.suggest", label: "4 layers · Gemini's estimate", button: true },
  "estimate-unsure": { glyph: "pv.suggest", label: "Gemini unsure · 3–5 layers", button: true },
  "estimate-app": { glyph: "pv.app", label: "App's rough estimate · no Gemini", button: true },
  "caution-financial": { glyph: "m.info", label: "Not financial advice", button: true },
  "caution-medical": { glyph: "safe.health", label: "Not medical advice", button: true },
  "caution-legal": { glyph: "m.info", label: "Not legal advice", button: true },
};
export const HONESTY_KIND_NAMES = Object.keys(HONESTY_KINDS) as HonestyKind[];
/** The kinds whose visible label must carry the who-word "Gemini" (D25). */
export const GEMINI_KINDS: readonly HonestyKind[] = [
  "gemini",
  "gemini-kept",
  "gemini-pick",
  "integrity",
  "constraints",
  "credential",
  "arrangement",
  "sized-by-gemini",
  "edit-numbers",
  // Revision 5, lane 9 (ui-motion.md §15.3): the six Gemini kinds of the topic map, and ruling N3's linked-one
  "gemini-linked",
  "gemini-linked-one",
  "gemini-placed",
  "gemini-picked-domain",
  "gemini-kept-by-you",
  "estimate-gemini",
  "estimate-unsure",
];
/** Revision 5, lane 9: the caution kinds, static at every level (D11): their panel opens instantly (the caller wraps them in [data-safety]). */
export const CAUTION_KINDS: readonly HonestyKind[] = ["caution-financial", "caution-medical", "caution-legal"];

export interface HonestyChipProps {
  kind: HonestyKind;
  /** The visible short label (the SHORT_* constant, or the verbatim constant); default the kind's words. */
  label?: string;
  /** A static chip's full string, read once (default: the kind's constant, else the label in words). */
  sr?: string;
  /** The full text: the chip becomes a button that opens it (one tap away, always in the DOM). */
  full?: ReactNode;
  /** The panel id (stable across server and client when given). */
  id?: string;
  /** Let a long label wrap (it never truncates). */
  wrap?: boolean;
  defs?: string;
  className?: string;
}

function glyphOf(kind: HonestyKind, defs?: string): ReactNode {
  const g = HONESTY_KINDS[kind].glyph;
  if (!g) return null;
  // a verdict glyph (v.over, v.unv) appears here only on the verdict-word kinds: Over, Unverified, Aim / library not checked (D27)
  return <Mark glyph={g} size={12} defs={defs} />;
}

export function HonestyChip({ kind, label, sr, full, id, wrap, defs, className }: HonestyChipProps) {
  const def = HONESTY_KINDS[kind];
  const text = label ?? def.label;
  // integrity is integrityLine verbatim (its REJECTED form names no one); every other Gemini kind keeps the word
  if (process.env.NODE_ENV !== "production" && GEMINI_KINDS.includes(kind) && kind !== "integrity" && !/Gemini/.test(text)) {
    throw new Error(`HonestyChip "${kind}": a Gemini mark keeps its who-word (D25): "${text}"`);
  }
  if (full != null) return <ChipButton kind={kind} glyph={glyphOf(kind, defs)} label={text} full={full} id={id} wrap={wrap} className={className} />;
  return (
    <span className={cx("chip", "mg-hc", wrap && "mg-wrap", className)} data-hc={kind}>
      <span aria-hidden="true" style={{ display: "contents" }}>
        {glyphOf(kind, defs)}
      </span>
      <span className="mg-hc-l" aria-hidden="true" data-wc="honest">
        {text}
      </span>
      <span className="sr-only">{sr ?? def.sr ?? speakFigure(text)}</span>
    </span>
  );
}

/** A chip row: column gap ≥ 8 px, row gap ≥ 16 px, so no two 40 px boxes intersect (D31). */
export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mg-chips", className)}>{children}</div>;
}

// ─── VerdictChip ────────────────────────────────────────────────────────────

export type VerdictKey = "FITTED" | "FITS" | "TIGHT" | "OVER" | "IMPOSSIBLE";
export const VERDICT_WORDS: Readonly<Record<VerdictKey, string>> = { FITTED: "Fitted", FITS: "Fits", TIGHT: "Tight", OVER: "Over", IMPOSSIBLE: "Impossible" };
export const VERDICT_GLYPH: Readonly<Record<VerdictKey, VerdictName>> = { FITTED: "v.fitted", FITS: "v.fits", TIGHT: "v.tight", OVER: "v.over", IMPOSSIBLE: "v.imp" };

/** roadmap-copy verdictWord's rule (glyph-check asserts they agree): "Unverified · Fits"; Fitted and Impossible are never unverified. */
export function verdictWordOf(v: VerdictKey, unverified = false): string {
  const w = VERDICT_WORDS[v];
  return unverified && v !== "FITTED" && v !== "IMPOSSIBLE" ? `Unverified · ${w}` : w;
}

export interface VerdictChipProps {
  verdict: VerdictKey;
  unverified?: boolean;
  /** A picker's chosen option (the active shape); a displayed verdict is idle. */
  chosen?: boolean;
  /** Override the word (only to pass verdictWord's own output). */
  word?: string;
  className?: string;
}

export function VerdictChip({ verdict, unverified, chosen, word, className }: VerdictChipProps) {
  const w = word ?? verdictWordOf(verdict, unverified);
  const unv = w.startsWith("Unverified");
  return (
    <span className={cx("chip", "mg-vc", className)} data-verdict={verdict} data-unverified={unv ? "" : undefined}>
      {unv && <Glyph name="v.unv" size={12} inherit />}
      <Glyph name={VERDICT_GLYPH[verdict]} state={chosen ? "active" : "idle"} size={12} inherit />
      <span data-wc="honest">{w}</span>
    </span>
  );
}
