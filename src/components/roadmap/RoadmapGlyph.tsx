/**
 * The roadmap's own glyph names, now an alias of glyph/Glyph (ui-motion.md
 * §4.3, R0). The 15 inline glyphs it drew became catalogue glyphs; this file
 * keeps the old names working while the lanes move to <Glyph name="…">:
 *
 *   minus → m.minus   down → m.down     info → m.info     cal → t.cal
 *   route → route     step → quest.step target → quest.checkpoint
 *   edit → pv.you     tick → pv.checked v-* → v.*         GlyphButton → glyph/GlyphButton
 *
 * The alias draws the idle shape in the text's own colour (the old glyphs
 * were static and took currentColor), keeps the kit's `.i` class (so its
 * sizing contexts hold: 20 px by default, 12 px inside a chip) and an
 * explicit `size` as an inline width and height, as before. A verdict glyph
 * still always sits beside its word (never colour or shape alone; D27). No
 * `title` anywhere (D13): a GlyphButton's name is its aria-label.
 */
import type { CSSProperties } from "react";
import { cx } from "@/components/ui/cx";
import { Glyph, GlyphButton as CatalogGlyphButton, type GlyphName } from "@/components/glyph/Glyph";

export type RoadmapGlyphName =
  | "minus"
  | "down"
  | "info"
  | "cal"
  | "route"
  | "step"
  | "target"
  | "edit"
  | "tick"
  | "v-fits"
  | "v-tight"
  | "v-over"
  | "v-imp"
  | "v-fitted"
  | "v-unv";

/** §4.3's table: each old name and the catalogue glyph it became. */
export const ROADMAP_GLYPH_ALIAS: Readonly<Record<RoadmapGlyphName, GlyphName>> = {
  minus: "m.minus",
  down: "m.down",
  info: "m.info",
  cal: "t.cal",
  route: "route",
  step: "quest.step",
  target: "quest.checkpoint",
  edit: "pv.you",
  tick: "pv.checked",
  "v-fits": "v.fits",
  "v-tight": "v.tight",
  "v-over": "v.over",
  "v-imp": "v.imp",
  "v-fitted": "v.fitted",
  "v-unv": "v.unv",
};

export function RoadmapGlyph({ name, size, className, style, label }: { name: RoadmapGlyphName; size?: number; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <Glyph
      name={ROADMAP_GLYPH_ALIAS[name]}
      size={size ?? 20}
      label={label}
      inherit
      className={cx("i", className)}
      style={size ? { width: size, height: size, ...style } : style}
    />
  );
}

/** A 44 px icon button with a roadmap glyph: glyph/GlyphButton under the old name (aria-label only, no `title`). */
export function GlyphButton({ glyph, label, onClick, className }: { glyph: RoadmapGlyphName; label: string; onClick: () => void; className?: string }) {
  return <CatalogGlyphButton glyph={ROADMAP_GLYPH_ALIAS[glyph]} label={label} onClick={onClick} className={className} />;
}
