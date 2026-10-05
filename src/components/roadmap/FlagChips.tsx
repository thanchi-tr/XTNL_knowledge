/**
 * Flags and notes on an item (F6, F9). A blocking flag is ink on raised with
 * the flag glyph, and its reason is always visible beside it; a note is quiet
 * and never blocks. Never colour alone: every chip is a word.
 *
 * UI motion (lane R4, ui-motion.md §3.3 screen 3, D12): the glyphs are the
 * catalogue's ([i-flag] for a flag, [m.info] for a note) and the contract is
 * unchanged — the words and the reasons stay visible. They are honesty marks
 * (the checker's findings about the words), so the word count exempts them
 * (data-wc="honest"); a note about who chose a type or a Domain (Gemini's
 * pick, not added yet, named from Gemini's pick) is one too. The other notes
 * are the app's plain words.
 */
import { Icon } from "@/components/ui/Icon";
import { Glyph } from "@/components/glyph/Glyph";
import type { BlockingFlag, ItemNote } from "@/lib/roadmap-types";
import { FLAG_WORD, NOTE_WORD, flagReasonLine, type flagReason } from "./roadmap-copy";

/** Notes that say who chose a type or a Domain: honesty marks (provenance), so they keep their words and are exempt. */
const HONEST_NOTES: ReadonlySet<ItemNote> = new Set<ItemNote>(["GEMINI_PICK", "NOT_CHOSEN", "FROM_SUGGESTION", "PRODUCTION_ADDED"]);

export function FlagChips({ flags, notes }: { flags: readonly BlockingFlag[]; notes?: readonly ItemNote[] }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f} className="rm-fl" data-wc="honest">
          <Icon name="flag" />
          {FLAG_WORD[f]}
        </span>
      ))}
      {(notes ?? [])
        .filter((n) => n !== "PLACEHOLDER")
        .map((n) => (
          <span key={n} className="rm-fl rm-fl-note" data-wc={HONEST_NOTES.has(n) ? "honest" : undefined}>
            <Glyph name="m.info" size={12} inherit />
            {NOTE_WORD[n]}
          </span>
        ))}
    </>
  );
}

/**
 * The reasons under the chips: one line per blocking flag, in words — the
 * checker's own (naming what set it) when the row carries them. `inline`: as
 * block spans, for a place only phrasing content may sit (a folded outline
 * node's summary, where the reason stays visible beside its flag).
 */
export function FlagReasons({ flags, ctx, reasons, inline }: { flags: readonly BlockingFlag[]; ctx: Parameters<typeof flagReason>[1]; reasons?: Partial<Record<BlockingFlag, string>>; inline?: boolean }) {
  if (flags.length === 0) return null;
  const lines = Array.from(new Set(flags.map((f) => flagReasonLine(f, reasons, ctx))));
  return (
    <>
      {lines.map((l) =>
        inline ? (
          <span key={l} className="rm-it-why rm-r4-why" data-wc="honest">
            {l}
          </span>
        ) : (
          <p key={l} className="rm-it-why" data-wc="honest">
            {l}
          </p>
        )
      )}
    </>
  );
}
