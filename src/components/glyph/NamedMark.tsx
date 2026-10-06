/**
 * The Gemini mark on a Domain's name (roadmap revision 5, lane 9; contracts
 * §22.11 TOPIC_NAME_KEPT, ruling 67; ui-motion.md §15.1 pv.named, D33).
 * Server-safe: no hooks.
 *
 *   <NamedMark/>                       pv.named at 12 px, aria-hidden, then one sr-only "named by Gemini"
 *   <NamedText parts/>                 a NamedPart[] (namedPartsOf): each Gemini-named part in its own
 *                                      data-wc="name" span with the mark after it, the rest as text
 *   <DomainName name geminiNamed/>     one Domain's name, with the mark when geminiNamedOf holds
 *
 * The mark sits after the name, inside the name's own span, until the user renames the Domain (a rename
 * removes it: geminiNamedOf). It is a glyph-only who-mark (D33): the visible word "Gemini" for the name
 * shows on the topic map and in the Domain's own sheet («Gemini · kept by you»), and the card Key lists
 * "named by Gemini".
 *
 * Delivery (D38): pv.named is a static provmark glyph. With `defs` naming a route that emits
 * <GlyphDefs families={["provmark"]}/>, it is a <use>; without, it is drawn inline (always correct).
 */
import type { ReactNode } from "react";
import type { NamedPart } from "@/lib/roadmap-types";
import { Glyph } from "./Glyph";

/** The mark's spoken words, read once per occurrence. */
export const NAMED_BY_GEMINI = "named by Gemini";

export function NamedMark({ defs }: { defs?: string }) {
  return (
    <>
      <span className="mg-nm" aria-hidden="true" data-pm="named">
        <Glyph name="pv.named" size={12} defs={defs} inherit />
      </span>
      <span className="sr-only">{NAMED_BY_GEMINI}</span>
    </>
  );
}

/** A Domain's name with the Gemini mark when it carries one. `wc` is the name's word-count class (names are exempt). */
export function DomainName({ name, geminiNamed, defs, wc = "name", className }: { name: string; geminiNamed: boolean; defs?: string; wc?: "name" | "own"; className?: string }) {
  if (!geminiNamed) {
    return (
      <span data-wc={wc} className={className}>
        {name}
      </span>
    );
  }
  return (
    <span data-wc={wc} className={className} data-named="">
      {name}
      <NamedMark defs={defs} />
    </span>
  );
}

/**
 * A text in NamedParts (a title, a measure's or a quest's label): the Gemini-named Domain names carry the mark;
 * the plain parts render as text (code's words keep their own counting class from the caller's wrapper).
 * With no Gemini-named part it renders the joined text only, so a LEVELS payload's markup is unchanged.
 */
export function NamedText({ parts, defs, fallback }: { parts: readonly NamedPart[] | null | undefined; defs?: string; fallback?: ReactNode }): ReactNode {
  if (!parts || parts.length === 0) return fallback ?? null;
  if (!parts.some((p) => p.geminiNamed)) return parts.map((p) => p.text).join("");
  return parts.map((p, i) =>
    p.geminiNamed ? (
      <span key={i} data-wc="name" data-named="">
        {p.text}
        <NamedMark defs={defs} />
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    )
  );
}

/** Whether a NamedPart list carries any Gemini-named part (the surfaces add the Key line only then). */
export function hasNamed(parts: readonly NamedPart[] | null | undefined): boolean {
  return Boolean(parts?.some((p) => p.geminiNamed));
}
