import type { Attribute } from "@prisma/client";
import { ATTRIBUTES } from "./attributes";

/**
 * A colour identity per attribute, so each path reads as its own place.
 *
 * This is the one spot where the app's single-accent discipline is
 * deliberately relaxed. Everywhere else, green means "you did the work" and
 * hue is rationed — but the thirteen skill paths are now thirteen separate
 * pages, and a player navigating between them needs to know which one
 * they are standing in before reading a single word. Rank still owns the
 * *shape* language (`skill-visuals.ts`); attribute owns the hue.
 *
 * Hues are spaced around the wheel and kept at similar lightness so no path
 * looks louder or more important than another, and all thirteen survive on
 * the near-black `--base` background.
 */

export interface AttributeTheme {
  attribute: Attribute;
  /** Primary hue — headings, node strokes, the path's signature. */
  color: string;
  /** Same hue, low alpha — panel washes and glow halos. */
  wash: string;
  /** Brighter variant for the one focal element per screen. */
  bright: string;
  /** Two-stop gradient for hero surfaces and emblem fills. */
  gradient: [string, string];
  /** URL slug — `/skills/critical-thinking`. */
  slug: string;
}

const RAW: Record<Attribute, { color: string; bright: string }> = {
  MIND: { color: "#4d9cf5", bright: "#8bc0ff" },
  PHYSICAL: { color: "#f0554d", bright: "#ff8a84" },
  CRITICAL_THINKING: { color: "#f0a030", bright: "#ffc470" },
  COMPASSION: { color: "#ff8fb0", bright: "#ffb8cd" },
  ABSTRACT: { color: "#9b6bff", bright: "#c4a6ff" },
  LOGIC: { color: "#2fd0ff", bright: "#7ee2ff" },
  REASON: { color: "#7fa8d4", bright: "#aec9e6" },
  REBUTTAL: { color: "#ff7a3d", bright: "#ffa878" },
  SELF_RESPECT: { color: "#ffd24d", bright: "#ffe28c" },
  FAITH: { color: "#7b6bff", bright: "#a89dff" },
  CREATIVITY: { color: "#ff5eb0", bright: "#ff96ce" },
  STUBBORNNESS: { color: "#c96a4a", bright: "#e2977c" },
  STATISTIC: { color: "#00cc7a", bright: "#3dffb0" },
};

/** `CRITICAL_THINKING` -> `critical-thinking`. */
export function attributeSlug(attribute: Attribute): string {
  return attribute.toLowerCase().replace(/_/g, "-");
}

/** Inverse of `attributeSlug`; returns null for anything not a real attribute. */
export function attributeFromSlug(slug: string): Attribute | null {
  const normalised = slug.toLowerCase();
  return ATTRIBUTES.find((a) => attributeSlug(a) === normalised) ?? null;
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export const ATTRIBUTE_THEMES: Record<Attribute, AttributeTheme> = Object.fromEntries(
  ATTRIBUTES.map((attribute) => {
    const { color, bright } = RAW[attribute];
    return [
      attribute,
      {
        attribute,
        color,
        bright,
        wash: hexToRgba(color, 0.12),
        gradient: [bright, color] as [string, string],
        slug: attributeSlug(attribute),
      },
    ];
  })
) as Record<Attribute, AttributeTheme>;

export function themeFor(attribute: Attribute): AttributeTheme {
  return ATTRIBUTE_THEMES[attribute];
}
