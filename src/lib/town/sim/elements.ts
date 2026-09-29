import type { Attribute } from "@prisma/client";

/**
 * The nine elements. Every legendary and mythic monster is of one, and so is
 * every champion's blow: the element of their weapon if it carries one, else
 * the element of the real emblem bound to them.
 *
 * Who beats whom:
 *
 *   water › fire › air › earth › thunder › water      (the natural ring)
 *   light ⇄ dark                                       (each the other's bane)
 *   time ⇄ space                                       (each the other's bane)
 *
 * A blow of the element that beats the target's lands half as hard again; a
 * blow of the element the target beats lands at six tenths. Light and dark,
 * and time and space, beat each other: a light champion cuts a dark monster
 * deep, and is cut as deep in return.
 */

export type Element = "earth" | "fire" | "water" | "air" | "thunder" | "light" | "dark" | "time" | "space";
export const ELEMENTS: Element[] = ["earth", "fire", "water", "air", "thunder", "light", "dark", "time", "space"];

export const ELEMENT_NAME: Record<Element, string> = {
  earth: "Earth", fire: "Fire", water: "Water", air: "Air", thunder: "Thunder", light: "Light", dark: "Dark", time: "Time", space: "Space",
};
/** A glyph for each, for labels and badges. */
export const ELEMENT_GLYPH: Record<Element, string> = {
  earth: "⛰", fire: "🔥", water: "💧", air: "🌪", thunder: "⚡", light: "☀", dark: "🌑", time: "⌛", space: "✦",
};

const BEATS: Record<Element, Element[]> = {
  water: ["fire"], fire: ["air"], air: ["earth"], earth: ["thunder"], thunder: ["water"],
  light: ["dark"], dark: ["light"], time: ["space"], space: ["time"],
};

export const COUNTER_BONUS = 1.5;
export const COUNTERED_PENALTY = 0.6;

/** What `e` beats. */
export const beats = (e: Element): Element[] => BEATS[e];
/** What beats `e`. */
export const beatenBy = (e: Element): Element[] => ELEMENTS.filter((x) => BEATS[x].includes(e));

/** The multiplier on a blow of element `att` against a target of element `def`. */
export function elementFactor(att?: Element | null, def?: Element | null): number {
  if (!att || !def) return 1;
  if (BEATS[att].includes(def)) return COUNTER_BONUS;
  if (BEATS[def].includes(att)) return COUNTERED_PENALTY;
  return 1;
}

/** How a blow of `att` fares against `def`, in words. */
export function matchup(att?: Element | null, def?: Element | null): "counters" | "countered" | "even" {
  const f = elementFactor(att, def);
  return f > 1 ? "counters" : f < 1 ? "countered" : "even";
}

/** The element each of the player's real attributes carries into town. */
export const ATTRIBUTE_ELEMENT: Record<Attribute, Element> = {
  PHYSICAL: "earth", STUBBORNNESS: "earth",
  CREATIVITY: "fire", SELF_RESPECT: "fire",
  COMPASSION: "water",
  CRITICAL_THINKING: "air", REASON: "air",
  LOGIC: "thunder", REBUTTAL: "thunder",
  FAITH: "light",
  MIND: "dark",
  STATISTIC: "time",
  ABSTRACT: "space",
};

export const elementOfAttribute = (a?: Attribute | null): Element | null => (a ? ATTRIBUTE_ELEMENT[a] ?? null : null);
