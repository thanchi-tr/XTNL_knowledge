/**
 * CapacityGauge (ui-motion.md §4.5, D27, D28): what a milestone needs a week
 * against what you have, on one scale, with its verdict chip. Static.
 * Server-safe.
 *
 *   <CapacityGauge need={{ value: 200, text: "3 h 20" }} have={{ value: 270, text: "4 h 30" }} unit="/wk"
 *     verdict="FITS" unverified label="Needs about 3 hours 20 a week; you have about 4 hours 30 a week."/>
 *
 * Two 6 px bars; 12 px HTML figures with ≈ (both are estimates); the verdict chip reads
 * verdictWord(verdict, unverified) ("Unverified · Fits" while capacity calibrates) and is read as
 * itself. The compact figures are aria-hidden; `label` is their one spoken sentence (no verdict in it).
 */
import { cx } from "@/components/ui/cx";
import { VerdictChip, type VerdictKey } from "./HonestyChip";

export interface GaugeFigure {
  /** On one scale with the other (minutes, hours: any unit, the same for both). */
  value: number;
  /** The compact figure ("3 h 20"). */
  text: string;
}

export interface CapacityGaugeProps {
  need: GaugeFigure;
  have: GaugeFigure;
  /** "/wk". */
  unit: string;
  verdict: VerdictKey;
  unverified?: boolean;
  /** The one spoken sentence for both figures and the verdict. */
  label: string;
  needWord?: string;
  haveWord?: string;
  className?: string;
}

export function CapacityGauge({ need, have, unit, verdict, unverified, label, needWord = "need", haveWord = "have", className }: CapacityGaugeProps) {
  const max = Math.max(need.value, have.value, 1e-9);
  const share = (v: number) => Math.max(0, Math.min(1, v / max)).toFixed(4);
  return (
    <div className={cx("mg-cg", className)} data-verdict={verdict}>
      <span className="sr-only">{label}</span>
      {(
        [
          ["need", needWord, need],
          ["have", haveWord, have],
        ] as const
      ).map(([k, word, f]) => (
        <div key={k} className="mg-cg-r" data-k={k} aria-hidden="true">
          <span>{word}</span>
          <span className="mg-cg-b">
            <i style={{ ["--v" as string]: share(f.value) }} />
          </span>
          <span className="mg-cg-f">
            ≈ {f.text}
            {k === "have" ? ` ${unit}` : ""}
          </span>
        </div>
      ))}
      <div className="mg-cg-v">
        <VerdictChip verdict={verdict} unverified={unverified} />
      </div>
    </div>
  );
}
