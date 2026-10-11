/**
 * How a Field's card is decorated, as a function of its level.
 *
 * `fieldLevel` is depth first (the best Domain counts fully, the next half,
 * the next a quarter …), so a Field stays below twice its best Domain but has
 * no ceiling of its own: this is a set of bands rather than a fixed ladder.
 *
 * **Colour is not the channel.** A field tile's accent already comes from
 * `fieldColor`, which hashes the name, and that is what tells Trading from
 * Mathematics at a glance. Recolouring by level would buy a progression
 * readout by destroying the identity readout — so level escalates through
 * *ornament* instead: a level badge, then a lit border, then bracket
 * notches, then a sheen, then a full crest ring. Colour answers "which",
 * decoration answers "how far".
 *
 * The ornaments are cumulative, so tiers are told apart by what is present
 * rather than by degree, and the top of the ladder reads as an accumulation
 * of everything below it.
 */

export type FieldTier = "DORMANT" | "NASCENT" | "ESTABLISHED" | "SUBSTANTIAL" | "FORMIDABLE" | "MONUMENTAL";

export interface FieldTierMeta {
  tier: FieldTier;
  label: string;
  /** Lowest level in the band, for the "next tier at N" hint. */
  from: number;
  /** Ornaments enabled at this tier. Cumulative — each tier keeps the ones below it. */
  badge: boolean;
  lit: boolean;
  notches: boolean;
  sheen: boolean;
  crest: boolean;
  /** Opacity of the level-driven glow, 0 disables it. */
  glow: number;
  blurb: string;
}

/**
 * Bands sized against the Σ domainLevel^0.75 curve the Field level used
 * before it went depth first (2026-10-11), where five Domains at level 5 sat
 * near 16. Depth first, those five read as 9 and a Field reaches 16 with its
 * Domains near level 9, 32 near level 17: the bands now mark depth, and were
 * left where they stand (scripts/balance-horizon.ts prints when a steady
 * player reaches them).
 */
export const FIELD_TIERS: FieldTierMeta[] = [
  {
    tier: "DORMANT",
    label: "Dormant",
    from: 0,
    badge: false,
    lit: false,
    notches: false,
    sheen: false,
    crest: false,
    glow: 0,
    blurb: "No points yet.",
  },
  {
    tier: "NASCENT",
    label: "Nascent",
    from: 1,
    badge: true,
    lit: false,
    notches: false,
    sheen: false,
    crest: false,
    glow: 0,
    blurb: "Started.",
  },
  {
    tier: "ESTABLISHED",
    label: "Established",
    from: 3,
    badge: true,
    lit: true,
    notches: false,
    sheen: false,
    crest: false,
    glow: 0.14,
    blurb: "Several domains carrying real weight.",
  },
  {
    tier: "SUBSTANTIAL",
    label: "Substantial",
    from: 8,
    badge: true,
    lit: true,
    notches: true,
    sheen: false,
    crest: false,
    glow: 0.2,
    blurb: "A body of work.",
  },
  {
    tier: "FORMIDABLE",
    label: "Formidable",
    from: 16,
    badge: true,
    lit: true,
    notches: true,
    sheen: true,
    crest: false,
    glow: 0.27,
    blurb: "Deep across many domains.",
  },
  {
    tier: "MONUMENTAL",
    label: "Monumental",
    from: 32,
    badge: true,
    lit: true,
    notches: true,
    sheen: true,
    crest: true,
    glow: 0.34,
    blurb: "The work of years.",
  },
];

export function fieldTier(level: number): FieldTierMeta {
  let match = FIELD_TIERS[0];
  for (const t of FIELD_TIERS) {
    if (level >= t.from) match = t;
  }
  return match;
}

/** The level at which the next tier begins, or null at the top of the ladder. */
export function nextTierAt(level: number): number | null {
  for (const t of FIELD_TIERS) {
    if (t.from > level) return t.from;
  }
  return null;
}
