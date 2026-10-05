/**
 * The per-route <symbol> block (ui-motion.md D3, §4.5). Server component:
 * a page emits it once, never layout.tsx (frozen).
 *
 *   <GlyphDefs route="rm" families={["evidence", "time", "provmark"]}/>
 *   then <Glyph name="ev.tested" defs="rm"/> draws <use href="#gd-rm-ev.tested-idle">.
 *
 * Static families only (evidence, safety, session, time, the ProvMark glyphs),
 * idle shapes only: a static glyph in another state, or without `defs`,
 * renders inline. Ids carry the route prefix (gd-rm-, gd-you-, gd-today-), so
 * two routes kept alive by Activity never share an id. Glyphs carry no
 * gradients, so a copy inside a hidden route still resolves.
 */
import { glyphSymbolId, renderPart } from "./Glyph";
import { DEFS_FAMILIES, GLYPH_NAMES, GLYPH_INFO, glyphParts, type DefsFamily, type GlyphName } from "./paths";

export interface GlyphDefsProps {
  /** The route prefix: lowercase letters and digits (rm, you, today, gx). */
  route: string;
  /** The static families this route draws (default: all of them). */
  families?: readonly DefsFamily[];
  /** Narrow to these glyphs (default: every glyph of the families). */
  names?: readonly GlyphName[];
}

/** The static glyphs a GlyphDefs block holds. */
export function defsList(families: readonly DefsFamily[] = DEFS_FAMILIES, names?: readonly GlyphName[]): GlyphName[] {
  const fams = new Set(families);
  return GLYPH_NAMES.filter((n) => {
    const f = GLYPH_INFO[n].defs;
    return f != null && fams.has(f) && (!names || names.includes(n));
  });
}

export function GlyphDefs({ route, families = DEFS_FAMILIES, names }: GlyphDefsProps) {
  if (!/^[a-z][a-z0-9]*$/.test(route)) throw new Error(`GlyphDefs: route "${route}" must be lowercase letters and digits`);
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      data-glyph-defs={route}
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      {defsList(families, names).map((n) => (
        <symbol key={n} id={glyphSymbolId(route, n, "idle")} viewBox="0 0 24 24">
          {glyphParts(n, "idle").map((p, i) => renderPart(p, i))}
        </symbol>
      ))}
    </svg>
  );
}
