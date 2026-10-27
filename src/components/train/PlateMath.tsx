/**
 * The line under a set row's weight (health-brief §3.5, zero taps): a barbell's plates a side from a 20 kg bar (45 lb)
 * and 25/20/15/10/5/2.5/1.25 kg plates, any shortfall named ('per side 25 + 15', '… · 0.5 kg short a side'), or a
 * bodyweight movement's load ('body weight 72 kg + 10', 'body weight 72 kg, assist 20', '65 % of body weight 72 kg').
 * training.ts does the sums (plateMathFor, plateLineOf); nothing here is a value of its own. No hooks: the row renders
 * it as it renders.
 */
import type { WeightUnit } from "@/lib/weight";
import { figureOf, loadTextOf, plateLineOf, plateMathFor, type LiftMovement } from "@/lib/training";

/** 'body weight 72 kg + 10', 'body weight 72 kg, assist 20', '65 % of body weight 72 kg': what a bodyweight set moves. */
export function bodyLineOf(bodyFraction: number, bodyKg: number, addedKg: number, unit: WeightUnit): string {
  const share = Math.abs(bodyFraction - 1) < 1e-9 ? "body weight" : `${Math.round(bodyFraction * 100)} % of body weight`;
  const base = `${share} ${loadTextOf(bodyKg, unit)}`;
  if (Math.abs(addedKg) < 0.005) return base;
  return addedKg > 0 ? `${base} + ${figureOf(addedKg, unit)}` : `${base}, assist ${figureOf(-addedKg, unit)}`;
}

/** The row's load line: a barbell's plates, a bodyweight movement's load with the body weight; null for anything else (or no weight). */
export function loadLineOf(m: Pick<LiftMovement, "load" | "equipment" | "bodyFraction">, weightKg: number | null, bodyKg: number | null, unit: WeightUnit): string | null {
  if (weightKg == null || !Number.isFinite(weightKg)) return null;
  if (m.load === "BW") return m.bodyFraction != null && bodyKg != null ? bodyLineOf(m.bodyFraction, bodyKg, weightKg, unit) : null;
  if (!(weightKg > 0)) return null;
  const plates = plateMathFor(m, weightKg, unit);
  return plates ? plateLineOf(plates) : null;
}

export function PlateMath({ line, id }: { line: string | null; id?: string }) {
  if (!line) return null;
  return (
    <p id={id} className="wt-lift-line">
      {line}
    </p>
  );
}
