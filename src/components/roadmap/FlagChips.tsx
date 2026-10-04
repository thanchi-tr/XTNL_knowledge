/**
 * Flags and notes on an item (F6, F9). A blocking flag is ink on raised with
 * the flag glyph, and its reason is always visible beside it; a note is quiet
 * and never blocks. Never colour alone: every chip is a word.
 */
import { Icon } from "@/components/ui/Icon";
import type { BlockingFlag, ItemNote } from "@/lib/roadmap-types";
import { FLAG_WORD, NOTE_WORD, flagReasonLine, type flagReason } from "./roadmap-copy";
import { RoadmapGlyph } from "./RoadmapGlyph";

export function FlagChips({ flags, notes }: { flags: readonly BlockingFlag[]; notes?: readonly ItemNote[] }) {
  return (
    <>
      {flags.map((f) => (
        <span key={f} className="rm-fl">
          <Icon name="flag" />
          {FLAG_WORD[f]}
        </span>
      ))}
      {(notes ?? [])
        .filter((n) => n !== "PLACEHOLDER")
        .map((n) => (
          <span key={n} className="rm-fl rm-fl-note">
            <RoadmapGlyph name="info" />
            {NOTE_WORD[n]}
          </span>
        ))}
    </>
  );
}

/** The reasons under the chips: one line per blocking flag, in words — the checker's own (naming what set it) when the row carries them. */
export function FlagReasons({ flags, ctx, reasons }: { flags: readonly BlockingFlag[]; ctx: Parameters<typeof flagReason>[1]; reasons?: Partial<Record<BlockingFlag, string>> }) {
  if (flags.length === 0) return null;
  const lines = Array.from(new Set(flags.map((f) => flagReasonLine(f, reasons, ctx))));
  return (
    <>
      {lines.map((l) => (
        <p key={l} className="rm-it-why">
          {l}
        </p>
      ))}
    </>
  );
}
