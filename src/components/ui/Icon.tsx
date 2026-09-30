/**
 * FROZEN CONTRACT — icons (L0-foundation).
 *
 *   <IconSprite/>                 the one inline sprite; AppShell renders it once per document
 *   <Icon name="today" size?/>    24 px stroke icon (1.75, round), currentColor
 *   <CurrencyGlyph kind="xp"/>    filled currency glyph in its hue: spark (xp), lozenge (pts), hex nut (mp)
 *   <Sigil track="body"/>         life-track sigils, told apart by shape, drawn in ink
 *   <HeldGlyph kind="freeze"/>    held glyphs; always paired with a word
 *
 * The sprite also carries the material gradients (m-iron … m-astral) that
 * Crest, Medallion and EmblemCoin reference as url(#m-…). Unicode glyph
 * icons (▾, ✓, ✗, 🔥) are retired: use these.
 */
import type { CSSProperties } from "react";
import type { CurrencyKind } from "@/lib/celebration-types";
import { cx } from "./cx";

export type IconName =
  | "today" | "study" | "train" | "plus" | "bell" | "moon" | "chev" | "back" | "x" | "inbox" | "check" | "clock"
  | "undo" | "gear" | "lock" | "replay" | "sheet" | "grid" | "star" | "chart" | "search" | "library" | "tree"
  | "flag" | "sword" | "share" | "dot3" | "flame";

export type TrackSigil = "body" | "duty" | "craft" | "care" | "know";
export type HeldKind = "freeze" | "rest" | "sick" | "away";

const SPRITE = `<defs>
<symbol id="i-today" viewBox="0 0 24 24"><path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 5v2.2M5.3 9.3l1.5 1.5M18.7 9.3l-1.5 1.5M8 21h8"/></symbol>
<symbol id="i-study" viewBox="0 0 24 24"><path d="M12 6.5C9.5 4.8 6.5 4.5 3.5 5.2v13c3-.7 6-.4 8.5 1.3 2.5-1.7 5.5-2 8.5-1.3v-13c-3-.7-6-.4-8.5 1.3zM12 6.5v13"/></symbol>
<symbol id="i-train" viewBox="0 0 24 24"><path d="M2.5 12.5h4l2.2-5.5 4.3 11 2.3-5.5h6.2"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 2H4.4zM10 20.5a2 2 0 0 0 4 0"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></symbol>
<symbol id="i-chev" viewBox="0 0 24 24"><path d="M9.5 6l6 6-6 6"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M14.5 6l-6 6 6 6"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-inbox" viewBox="0 0 24 24"><path d="M3.5 13.5l2.5-8h12l2.5 8v5h-17zM3.5 13.5h5l1 2h5l1-2h5"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-undo" viewBox="0 0 24 24"><path d="M9 7L4.5 11.5 9 16M5 11.5h9.5a5 5 0 0 1 0 10H12"/></symbol>
<symbol id="i-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2L5.5 5.5"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></symbol>
<symbol id="i-replay" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4"/><path d="M10.5 9.5l4 2.5-4 2.5z"/></symbol>
<symbol id="i-sheet" viewBox="0 0 24 24"><path d="M12 2.8l7.5 4.3v9.8L12 21.2l-7.5-4.3V7.1z"/></symbol>
<symbol id="i-grid" viewBox="0 0 24 24"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></symbol>
<symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/></symbol>
<symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-7"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></symbol>
<symbol id="i-library" viewBox="0 0 24 24"><path d="M5 4v16M9.5 4v16M14 5l4.5 15"/></symbol>
<symbol id="i-tree" viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.2"/><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="19" r="2.2"/><path d="M12 7.2v4.3M12 11.5l-5 5.4M12 11.5l5 5.4"/></symbol>
<symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4.5h11l-2 4 2 4H5"/></symbol>
<symbol id="i-sword" viewBox="0 0 24 24"><path d="M14.5 4.5H19.5v5L10 19l-5-5zM7.5 16.5l-3 3M6 13l5 5"/></symbol>
<symbol id="i-share" viewBox="0 0 24 24"><path d="M12 15V3.5M8 7.5l4-4 4 4M5 12v7.5h14V12"/></symbol>
<symbol id="i-dot3" viewBox="0 0 24 24"><path d="M6 12h.01M12 12h.01M18 12h.01" stroke-width="3"/></symbol>
<symbol id="i-flame" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12.2 2.5c.6 3-1 4.8-2.6 6.6C8 10.9 6.5 12.6 6.5 15.4a5.5 5.5 0 0 0 11 0c0-2.1-.9-3.7-1.9-5-.3 1.3-1 2.3-2 2.8.6-3.6-.2-7.9-1.4-10.7z"/></symbol>
<symbol id="c-xp" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.8l2.3 7.9 7.9 2.3-7.9 2.3L12 22.2l-2.3-7.9L1.8 12l7.9-2.3z"/></symbol>
<symbol id="c-pts" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l8.5 10L12 22 3.5 12zm0 4.6L7.4 12 12 17.4 16.6 12z"/><path fill="currentColor" d="M12 9.2l2.4 2.8-2.4 2.8-2.4-2.8z"/></symbol>
<symbol id="c-mp" viewBox="0 0 24 24"><path fill="currentColor" d="M12 1.8l8.8 5.1v10.2L12 22.2l-8.8-5.1V6.9zm0 4.3L6.9 9v6l5.1 2.9 5.1-2.9V9z"/></symbol>
<symbol id="s-body" viewBox="0 0 24 24"><path d="M12 3.5l8.5 15.5h-17z"/></symbol>
<symbol id="s-duty" viewBox="0 0 24 24"><path d="M12 3l7 2.8V11c0 4.6-3 8-7 10-4-2-7-5.4-7-10V5.8z"/></symbol>
<symbol id="s-craft" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1.5"/><path d="M5 12h14"/></symbol>
<symbol id="s-care" viewBox="0 0 24 24"><path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/></symbol>
<symbol id="s-know" viewBox="0 0 24 24"><path d="M12 6.5C9.5 4.8 6.5 4.5 3.5 5.2v13c3-.7 6-.4 8.5 1.3 2.5-1.7 5.5-2 8.5-1.3v-13c-3-.7-6-.4-8.5 1.3zM12 6.5v13"/></symbol>
<symbol id="h-freeze" viewBox="0 0 24 24"><path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5M9.6 3.9L12 6.3l2.4-2.4M9.6 20.1L12 17.7l2.4 2.4"/></symbol>
<symbol id="h-rest" viewBox="0 0 24 24"><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/></symbol>
<symbol id="h-sick" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/></symbol>
<symbol id="h-away" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="2"/><path d="M9 8V5.5h6V8M4 13h16"/></symbol>
<linearGradient id="m-iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c3c9d4"/><stop offset=".45" stop-color="#8a93a4"/><stop offset="1" stop-color="#434a5a"/></linearGradient>
<linearGradient id="m-bronze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3c08f"/><stop offset=".5" stop-color="#c0834f"/><stop offset="1" stop-color="#8a5530"/></linearGradient>
<linearGradient id="m-silver" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#c9d1de"/><stop offset="1" stop-color="#7d889c"/></linearGradient>
<linearGradient id="m-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0bd"/><stop offset=".45" stop-color="#f0c75e"/><stop offset="1" stop-color="#a8721a"/></linearGradient>
<linearGradient id="m-astral" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d8f3ff"/><stop offset=".5" stop-color="#c7b5ff"/><stop offset="1" stop-color="#ffd9ee"/></linearGradient>
</defs>`;

/** Rendered once, by AppShell. Hidden and inert; referenced by id. */
export function IconSprite() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

interface IconProps {
  name: IconName;
  /** px; default from CSS (20). */
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** Give a label only when the icon stands alone and means something; otherwise it is decorative. */
  label?: string;
}

export function Icon({ name, size, className, style, label }: IconProps) {
  return (
    <svg
      className={cx("i", className)}
      style={size ? { width: size, height: size, ...style } : style}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
      focusable="false"
    >
      <use href={`#i-${name}`} />
    </svg>
  );
}

const CURRENCY_LABEL: Record<CurrencyKind, string> = { xp: "life XP", pts: "review points", mp: "mastery points" };

export function CurrencyGlyph({ kind, size, className, label }: { kind: CurrencyKind; size?: number; className?: string; label?: boolean }) {
  return (
    <svg
      className={cx("g", `c-${kind}`, className)}
      style={size ? { width: size, height: size } : undefined}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label ? CURRENCY_LABEL[kind] : undefined}
      focusable="false"
    >
      <use href={`#c-${kind}`} />
    </svg>
  );
}

export function Sigil({ track, size, className }: { track: TrackSigil; size?: number; className?: string }) {
  return (
    <svg className={cx("sig", className)} style={size ? { width: size, height: size } : undefined} aria-hidden="true" focusable="false">
      <use href={`#s-${track}`} />
    </svg>
  );
}

export function HeldGlyph({ kind, size, className }: { kind: HeldKind; size?: number; className?: string }) {
  return (
    <svg className={cx("sig", className)} style={size ? { width: size, height: size } : undefined} aria-hidden="true" focusable="false">
      <use href={`#h-${kind}`} />
    </svg>
  );
}
