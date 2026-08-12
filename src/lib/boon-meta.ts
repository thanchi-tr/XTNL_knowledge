/**
 * Boon vocabulary and pure folding helpers — the positive mirror of
 * `debuff-meta.ts`, split from `boons.ts` for the same reason: no database
 * dependency, so client components can read it without dragging Prisma
 * into the browser bundle.
 */

export type BoonKind = "INSIGHT" | "MOMENTUM" | "FOCUS" | "CLARITY";

export interface BoonMeta {
  kind: BoonKind;
  label: string;
  effectText: (magnitude: number) => string;
  /** One line of flavour, shown on the cache reveal. */
  blurb: string;
  magnitude: number;
  durationHours: number;
}

/**
 * Four boons, deliberately of comparable worth.
 *
 * This is the design constraint that keeps a Spoils Cache from being a
 * gamble: you cannot draw a "bad" one and you cannot draw a jackpot, so
 * there is nothing to re-roll for. The randomness decides *what kind of
 * good thing* you get for the next day, never *how much* — the mastery a
 * victory pays is fixed and stated before you commit to the fight.
 */
export const BOON_META: Record<BoonKind, BoonMeta> = {
  INSIGHT: {
    kind: "INSIGHT",
    label: "Insight",
    effectText: (m) => `+${Math.round(m * 100)}% points per review`,
    blurb: "The material is briefly transparent. Everything you clear is worth more.",
    magnitude: 0.25,
    durationHours: 24,
  },
  MOMENTUM: {
    kind: "MOMENTUM",
    label: "Momentum",
    effectText: (m) => `Combo ceiling +${Math.round(m)}`,
    blurb: "One answer pulls the next along behind it.",
    magnitude: 8,
    durationHours: 24,
  },
  FOCUS: {
    kind: "FOCUS",
    label: "Focus",
    effectText: (m) => `+${Math.round(m)} strike${m === 1 ? "" : "s"} before decay`,
    blurb: "A steadier hand. Mistakes cost less than they should.",
    magnitude: 2,
    durationHours: 24,
  },
  CLARITY: {
    kind: "CLARITY",
    label: "Clarity",
    effectText: (m) => `+${Math.round(m)}d grace before decay`,
    blurb: "Nothing slips while you are looking elsewhere.",
    magnitude: 3,
    durationHours: 24,
  },
};

export const BOON_KINDS = Object.keys(BOON_META) as BoonKind[];

export interface ActiveBoonRow {
  kind: BoonKind;
  magnitude: number;
  reason: string;
  expiresAt: Date;
}

/** The single best magnitude currently active per kind — mirrors `worstByKind`. */
export function bestByKind(boons: ActiveBoonRow[]): Partial<Record<BoonKind, number>> {
  const out: Partial<Record<BoonKind, number>> = {};
  for (const b of boons) {
    out[b.kind] = Math.max(out[b.kind] ?? 0, b.magnitude);
  }
  return out;
}
