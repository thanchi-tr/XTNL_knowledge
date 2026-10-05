/**
 * A string's provenance (Provenance; F9; ui-motion.md §3.3 screen 3, §4.4
 * Provenance, D13, D25, D29). The class is derived on read from origin ×
 * decision (roadmap-types provenanceOf), never stored. Compact since the UI
 * motion round (lane R4): Gemini's words keep a visible chip with the
 * who-word; everyone else's are a glyph-only mark. The exact current words
 * stay in the DOM, read once (sr-only), and every card lists them in its Key.
 *
 *   DRAFT            «[pv.suggest] Gemini · not checked»        sr "Gemini suggestion · not checked"
 *   KEPT_SUGGESTION  «[pv.kept] Gemini · kept · not checked»     sr "Gemini's words · kept by you · not checked"
 *   a Gemini pick    «[pv.pick] Gemini's choice · not checked»   sr GEMINI_CHOICE_WORDS (or the v3 words);
 *                    «Gemini's choice» once the row is kept
 *   YOURS            [pv.you] "You wrote this" · [pv.checked] "You checked this" · [pv.syllabus] "Your syllabus line"
 *   WORKED_OUT       [pv.app] "Written by the app" ("added by the app" on a type the app chose)
 *
 * "Not checked" is the balloon shape (pv.suggest family), never a dashed rim
 * (D29: dashed means calibrating or not yet counted). No `title` anywhere.
 *
 * TitleClassChip keeps its full words for the surfaces that still echo a
 * title in a list (the Milestones list, the Aim card, the Start sheet); those
 * lanes move to the compact chip when they land their screens.
 */
import { cx } from "@/components/ui/cx";
import { Glyph, ProvMark, type ProvMarkClass } from "@/components/glyph/Glyph";
import { provenanceOf, type Decision, type Origin, type TextClass } from "@/lib/roadmap-types";
import { SHORT_GEMINI, SHORT_GEMINI_KEPT, provenanceChipWords, shortGeminiChoice } from "./roadmap-copy";

/**
 * The route whose GlyphDefs block holds the static glyphs (evidence, the
 * provenance marks, time). Undefined: every glyph is drawn inline, which is
 * always correct. Set it to "rm" once the roadmap pages emit
 * <GlyphDefs route="rm"/> (D3), and the rows' static glyphs become <use>.
 */
export const ROW_DEFS: string | undefined = undefined;

/**
 * A title's chip where only its class is known (MilestoneRowView.titleClass,
 * AimCardMilestone.titleClass): Gemini's words always carry theirs — "Gemini
 * suggestion · not checked" or "Gemini's words · kept by you · not checked".
 * The user's and the app's titles show none in these compact lists.
 */
export function TitleClassChip({ cls, className }: { cls: TextClass | null | undefined; className?: string }) {
  if (cls === "DRAFT") return <span className={cx("rm-pv", "rm-pv-draft", className)}>{provenanceChipWords(cls, false)}</span>;
  if (cls === "KEPT_SUGGESTION") return <span className={cx("rm-pv", "rm-pv-kept", className)}>{provenanceChipWords(cls, false)}</span>;
  return null;
}

export type GeminiMarkKind = "draft" | "kept" | "pick";
const GEMINI_GLYPH = { draft: "pv.suggest", kept: "pv.kept", pick: "pv.pick" } as const;
const GEMINI_CLASS = { draft: "rm-pv-draft", kept: "rm-pv-kept", pick: "rm-pv-pick" } as const;

/**
 * A static Gemini chip (a repeated row mark, D13): the balloon and the short
 * label aria-hidden, the exact words sr-only, read once. `sr` null: the words
 * are read elsewhere in the same sentence (a measure's spoken line), so the
 * chip adds none. The visible label always carries "Gemini" (D25).
 */
export function GeminiChip({ kind, label, sr, className }: { kind: GeminiMarkKind; label: string; sr: string | null; className?: string }) {
  if (process.env.NODE_ENV !== "production" && !/Gemini/.test(label)) throw new Error(`GeminiChip: a Gemini mark keeps its who-word (D25): "${label}"`);
  return (
    <span className={cx("rm-pv", GEMINI_CLASS[kind], className)}>
      <Glyph name={GEMINI_GLYPH[kind]} size={12} inherit />
      <span aria-hidden="true" data-wc="honest">
        {label}
      </span>
      {sr != null && <span className="sr-only">{sr}</span>}
    </span>
  );
}

/** A Gemini pick of a type (CatalogChip): «Gemini's choice · not checked» while the row waits, «Gemini's choice» once kept. */
export function GeminiPickChip({ draft, words }: { draft: boolean; words: string }) {
  return <GeminiChip kind="pick" label={shortGeminiChoice(draft)} sr={words} />;
}

/** Which glyph-only mark a non-Gemini class takes. */
export function provMarkOf(origin: Origin, decision: Decision): ProvMarkClass | null {
  const cls = provenanceOf(origin, decision);
  if (cls === "DRAFT" || cls === "KEPT_SUGGESTION") return null;
  if (cls === "WORKED_OUT") return "app-written";
  if (origin === "SYLLABUS" && decision !== "EDITED") return "syllabus";
  return decision === "CHECKED" ? "checked" : "you";
}

/** The exact current words of each mark (the sr text; the card Key lists them). */
export function provMarkWords(mark: ProvMarkClass): string {
  if (mark === "app-written") return provenanceChipWords("WORKED_OUT", false);
  if (mark === "syllabus") return "Your syllabus line";
  if (mark === "checked") return provenanceChipWords("YOURS", true);
  if (mark === "you") return provenanceChipWords("YOURS", false);
  return mark === "app-added" ? "added by the app" : "worked out by the app";
}

export function ProvenanceChip({ origin, decision, className }: { origin: Origin; decision: Decision; className?: string }) {
  const cls = provenanceOf(origin, decision);
  if (cls === "DRAFT") return <GeminiChip kind="draft" label={SHORT_GEMINI} sr={provenanceChipWords(cls, false)} className={className} />;
  if (cls === "KEPT_SUGGESTION") return <GeminiChip kind="kept" label={SHORT_GEMINI_KEPT} sr={provenanceChipWords(cls, false)} className={className} />;
  const mark = provMarkOf(origin, decision)!;
  return <ProvMark cls={mark} words={provMarkWords(mark)} size={16} defs={ROW_DEFS} className={className} />;
}
