"use client";

/**
 * The sources Google linked to Gemini's sentence about a term (roadmap
 * revision 5, lane 9; ui-motion.md §15.5; contracts §22.3 TopicSource,
 * §22.11). Only the grounding record's chunks reach it: `TopicRowView.sources`
 * (groundingChunks.web, at most GROUND_SOURCES_SHOWN). The sheet claims no
 * host and never says the pages use the term.
 *
 *   «[pv.web] Gemini · Google linked 2 sources» and its full string
 *   <title> (from Google)   a link to the chunk uri, rel "noopener noreferrer nofollow", target "_blank"
 *
 * If Google's display terms require Search Suggestions (spec question 16), they go here, in a sandboxed
 * iframe; lane 13 decides. Nothing here is rendered before GROUND linked the term.
 */
import { Sheet } from "@/components/ui/Sheet";
import { HonestyChip } from "@/components/glyph/HonestyChip";
import { GROUND_SOURCES_SHOWN, type TopicSource } from "@/lib/roadmap-types";
import { GEMINI_LINKED_FULL, SOURCES_TITLE, geminiLinkedLabel, sourceRowText } from "./roadmap-copy";

/** A source's uri, only when it is a plain http(s) link (anything else renders as text, never a link). */
export function sourceHrefOf(uri: string): string | null {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export function SourcesList({ sources }: { sources: readonly TopicSource[] }) {
  return (
    <ul className="rm-tm-src">
      {sources.slice(0, GROUND_SOURCES_SHOWN).map((s, i) => {
        const href = sourceHrefOf(s.uri);
        return (
          <li key={i}>
            {href ? (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="rm-tm-srca">
                {sourceRowText(s.title)}
              </a>
            ) : (
              <span>{sourceRowText(s.title)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function SourcesSheet({ open, onClose, name, sources }: { open: boolean; onClose: () => void; name: string; sources: readonly TopicSource[] }) {
  const shown = sources.slice(0, GROUND_SOURCES_SHOWN);
  return (
    <Sheet open={open} onClose={onClose} title={SOURCES_TITLE} description={name}>
      <div className="rm-stack" style={{ gap: 12 }}>
        <div>
          <HonestyChip kind="gemini-linked" label={geminiLinkedLabel(Math.max(2, shown.length))} sr={GEMINI_LINKED_FULL} wrap />
        </div>
        <p className="t-meta" style={{ margin: 0 }}>
          {GEMINI_LINKED_FULL}
        </p>
        <SourcesList sources={shown} />
      </div>
    </Sheet>
  );
}
