/**
 * A plan-born task's or goal's title on Today with the Gemini mark (the live fix; contracts §22.11
 * TOPIC_NAME_KEPT, ruling 67; ui-motion §15.1 pv.named). Start bakes "{kind}: {Domains}" into the
 * template's title, so the names of that milestone's Gemini-named Domains (roadmap-quests-server
 * loadTodayNamedTitles) are marked at render time over the title as it stands: a renamed Domain is
 * no longer in the list, and a title the user renamed keeps a mark only where the name still occurs.
 *
 * The mark itself is the page's <NamedMark/> (glyph/NamedMark), passed in as a node the way the page
 * passes questsSlot, so the board's own module graph never loads the glyph sheet (today-ui-check
 * renders the board in Node). Each marked name is drawn as glyph/NamedText draws one: a
 * data-wc="name" data-named span holding the name and the mark. Server-safe: no hooks.
 */
import type { ReactNode } from "react";
import { namedPartsOf } from "@/lib/roadmap-types";

/** What the page hands the board: each template's names to mark, and the mark (the page's <NamedMark/>). */
export interface TodayNamedTitles {
  names: Readonly<Record<string, readonly string[]>>;
  mark: ReactNode;
}

/** The names to mark in a template's title, or undefined: none. */
export function namedOfTitle(named: TodayNamedTitles | null | undefined, templateId: string): readonly string[] | undefined {
  const map = named?.names;
  if (!map || !Object.prototype.hasOwnProperty.call(map, templateId)) return undefined;
  const names = map[templateId];
  return Array.isArray(names) && names.length > 0 ? names : undefined;
}

/** `title` with the mark after each marked name it holds; the plain title when it holds none (or no mark was given). */
export function NamedTitle({ title, named, mark }: { title: string; named?: readonly string[] | null; mark?: ReactNode }): ReactNode {
  if (!named || named.length === 0 || mark == null) return title;
  const parts = namedPartsOf(
    title,
    named.map((name) => ({ name, geminiNamed: true }))
  );
  if (!parts.some((p) => p.geminiNamed)) return title;
  return parts.map((p, i) =>
    p.geminiNamed ? (
      <span key={i} data-wc="name" data-named="">
        {p.text}
        {mark}
      </span>
    ) : (
      <span key={i}>{p.text}</span>
    )
  );
}
