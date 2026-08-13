import type { Skill } from "./skill-pool";
import type { ResonanceGrade, LoadoutResonance } from "./loadout-sets";
import type { ChargeVariant } from "@/components/skills/BarCharge";

/**
 * Which bar effect plays on an attach.
 *
 * All three concepts are kept, and the choice between them carries meaning:
 * the effect says *what just happened*, not merely that something did. Three
 * outcomes are worth telling apart at the moment you slot something, and each
 * concept already reads as one of them:
 *
 *   bloom — ignition. Your standing changed. Either the emblem is one of the
 *     two terminal ranks, or the attach lifted the loadout's resonance grade.
 *     The only one that leaves an aftermath, because it is the only one that
 *     marks a change you keep.
 *
 *   surge — conduction. The emblem connected to what was already there: it
 *     completed a set without lifting the grade. Directional by design, so
 *     you can see which slot closed the circuit.
 *
 *   meter — accumulation. Nothing composed. The bar simply holds more than
 *     it did, which is the honest reading of adding an unrelated emblem.
 *
 * Ordered, not scored: the first matching rule wins, and they are arranged
 * most-significant first so a grade lift is never reported as a mere set
 * completion. Pure, so the bar can evaluate it against its own optimistic
 * loadout without waiting for the server.
 */

const GRADE_ORDER: ResonanceGrade[] = [
  "NONE",
  "FAINT",
  "ALIGNED",
  "HARMONIC",
  "RESONANT",
  "TRANSCENDENT",
];

function gradeRank(grade: ResonanceGrade): number {
  return GRADE_ORDER.indexOf(grade);
}

export interface AttachOutcome {
  variant: ChargeVariant;
  /** Why this one fired — shown in the reference page, and useful in a tooltip. */
  reason: string;
}

/**
 * `before` and `after` are the resonance of the loadout without and with the
 * emblem. The caller already computes both — the bar recomputes resonance on
 * every optimistic change — so nothing here needs to touch the database.
 */
export function attachOutcome(
  skill: Skill,
  before: LoadoutResonance,
  after: LoadoutResonance
): AttachOutcome {
  if (gradeRank(after.grade) > gradeRank(before.grade)) {
    return { variant: "bloom", reason: `Resonance rose to ${after.grade.toLowerCase()}` };
  }

  if (skill.rank === "ULTIMATE" || skill.rank === "APEX") {
    return { variant: "bloom", reason: `${skill.rank} equipped` };
  }

  const held = new Set(before.sets.map((s) => s.id));
  const gained = after.sets.find((s) => !held.has(s.id));
  if (gained) {
    return { variant: "surge", reason: `${gained.name} completed` };
  }

  // A set can also deepen without a new shape appearing — Choir becoming a
  // wider Choir. That is still the emblem connecting to what was there, so it
  // conducts rather than merely accumulating.
  const grew = after.sets.some((a) => {
    const b = before.sets.find((x) => x.id === a.id);
    return b !== undefined && a.members.length > b.members.length;
  });
  if (grew) {
    return { variant: "surge", reason: "Set deepened" };
  }

  return { variant: "meter", reason: "Power added, nothing composed" };
}
