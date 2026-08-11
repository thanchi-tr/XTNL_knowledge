/**
 * Debuff vocabulary and pure folding helpers.
 *
 * Split from `debuffs.ts` for the same reason `xp.ts` is split from
 * `srs.ts`: this half has no database dependency, and client components
 * (the skills page's gate preview) need it. Importing it from `debuffs.ts`
 * would drag Prisma into the browser bundle.
 *
 * See `debuffs.ts` for the design rules these kinds obey — never random,
 * never destructive, always self-expiring.
 */

export type DebuffKind = "SHAKEN" | "FATIGUED" | "DOUBT";

export interface DebuffMeta {
  kind: DebuffKind;
  label: string;
  /** What it costs the player, in plain language, for the UI. */
  effectText: (magnitude: number) => string;
  /** Why it happened — shown alongside so a debuff never feels arbitrary. */
  blurb: string;
  defaultMagnitude: number;
  /** Hard ceiling; `applyDebuff` clamps to this however it is called. */
  maxMagnitude: number;
  durationHours: number;
}

export const DEBUFF_META: Record<DebuffKind, DebuffMeta> = {
  SHAKEN: {
    kind: "SHAKEN",
    label: "Shaken",
    effectText: (m) => `−${Math.round(m * 100)}% points per review`,
    blurb: "A loss you walked into knowingly. It costs yield, not progress.",
    defaultMagnitude: 0.25,
    maxMagnitude: 0.4,
    durationHours: 24,
  },
  FATIGUED: {
    kind: "FATIGUED",
    label: "Fatigued",
    effectText: (m) => `Combo ceiling cut by ${Math.round(m * 100)}%`,
    blurb: "Pushed past the point of sharpness. Rest, or grind at a lower ceiling.",
    defaultMagnitude: 0.5,
    maxMagnitude: 0.6,
    durationHours: 18,
  },
  DOUBT: {
    kind: "DOUBT",
    label: "Doubt",
    effectText: (m) => `−${m.toFixed(0)}% to every attribute score`,
    blurb: "A long streak broken. Standing slips until you show up again.",
    defaultMagnitude: 8,
    maxMagnitude: 15,
    durationHours: 72,
  },
};

export const DEBUFF_KINDS = Object.keys(DEBUFF_META) as DebuffKind[];

export interface ActiveDebuffRow {
  kind: DebuffKind;
  magnitude: number;
  reason: string;
  expiresAt: Date;
}

/** The single worst magnitude currently active per kind. */
export function worstByKind(debuffs: ActiveDebuffRow[]): Partial<Record<DebuffKind, number>> {
  const out: Partial<Record<DebuffKind, number>> = {};
  for (const d of debuffs) {
    out[d.kind] = Math.max(out[d.kind] ?? 0, d.magnitude);
  }
  return out;
}
