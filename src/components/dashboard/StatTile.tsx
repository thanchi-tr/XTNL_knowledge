interface Props {
  label: string;
  value: string;
  /** Optional unit/qualifier shown after the figure at reduced weight. */
  unit?: string;
  /** Caption under the figure: a denominator, comparison, or note. */
  sub?: string;
  /**
   * Signal tone, for a figure that IS a state (kept, owed, held). Omit for an
   * ordinary metric: on the redesign a figure is ink, and colour reports
   * state only. The legacy names map onto the signal tokens.
   */
  tone?: "green" | "red" | "amber" | "blue";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  green: "var(--kept)",
  red: "var(--owed)",
  amber: "var(--ink-0)",
  blue: "var(--held)",
};

/** One figure on a card, in the display numeral; long values step down rather than overflow. */
export function StatTile({ label, value, unit, sub, tone }: Props) {
  const size = value.length > 12 ? 16 : value.length > 8 ? 20 : 24;
  return (
    <div className="card pad" style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="t-eyebrow" title={label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
        <span className="num" style={{ font: `600 ${size}px/1.1 var(--font-display)`, color: tone ? TONE[tone] : "var(--ink-0)", overflowWrap: "anywhere" }}>
          {value}
        </span>
        {unit && <span className="t-meta">{unit}</span>}
      </span>
      {sub && <span className="t-meta">{sub}</span>}
    </div>
  );
}
