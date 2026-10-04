/**
 * The roadmap's own glyphs (lane R5), drawn inline: the kit's sprite
 * (ui/Icon.tsx, frozen) has no minus, calendar, step, target, edit or verdict
 * glyphs, and the mockups use them. Same grammar as the kit's icons: 24 px
 * box, 1.75 stroke, round caps, currentColor, decorative unless labelled.
 * A verdict glyph always sits beside its word (never colour or shape alone).
 */
import type { CSSProperties } from "react";
import { cx } from "@/components/ui/cx";

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

function paths(name: RoadmapGlyphName) {
  switch (name) {
    case "minus":
      return <path d="M5 12h14" />;
    case "down":
      return <path d="M6 9.5l6 6 6-6" />;
    case "info":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11v5.5M12 7.6v.01" />
        </>
      );
    case "cal":
      return (
        <>
          <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
          <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
        </>
      );
    case "route":
      return (
        <>
          <circle cx="6" cy="18" r="2.2" />
          <circle cx="18" cy="6" r="2.2" />
          <path d="M8.2 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.8" />
        </>
      );
    case "step":
      return <path d="M4 19h5v-5h5V9h6" />;
    case "target":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.5" />
        </>
      );
    case "edit":
      return <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />;
    case "tick":
    case "v-fits":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M8 12.3l2.7 2.7L16 9.6" />
        </>
      );
    case "v-tight":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5v17" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
        </>
      );
    case "v-over":
      return <path d="M12 3.8l9 15.7H3zM12 10v4.2M12 16.9v.01" />;
    case "v-imp":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M6 6l12 12" />
        </>
      );
    case "v-fitted":
      return <path d="M4 8h16M4 16h16M8 5v6M16 13v6" />;
    case "v-unv":
      return (
        <>
          <circle cx="12" cy="12" r="8.5" strokeDasharray="2.6 2.6" />
          <path d="M8 12.3l2.7 2.7L16 9.6" />
        </>
      );
  }
}

export function RoadmapGlyph({ name, size, className, style, label }: { name: RoadmapGlyphName; size?: number; className?: string; style?: CSSProperties; label?: string }) {
  return (
    <svg
      className={cx("i", className)}
      viewBox="0 0 24 24"
      style={size ? { width: size, height: size, ...style } : style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      {paths(name)}
    </svg>
  );
}

/** A 44 px icon button with a roadmap glyph (the kit's IconButton takes only sprite icons). */
export function GlyphButton({ glyph, label, onClick, className }: { glyph: RoadmapGlyphName; label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" className={cx("icon-btn", className)} aria-label={label} title={label} onClick={onClick}>
      <RoadmapGlyph name={glyph} />
    </button>
  );
}
