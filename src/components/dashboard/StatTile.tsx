interface Props {
  label: string;
  value: string;
  /** Optional unit/qualifier shown after the figure at reduced weight. */
  unit?: string;
  /** Caption under the figure — a denominator, comparison, or note. */
  sub?: string;
  /**
   * Semantic tone. Omit for an ordinary metric: in this system colour marks
   * review state, so a figure that isn't a status stays in the text ramp.
   */
  tone?: "green" | "red" | "amber" | "blue";
}

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  green: "var(--green)",
  red: "var(--red)",
  amber: "var(--amber)",
  blue: "var(--blue)",
};

/**
 * Single figure card, matching XTNL_thesis's MetricCard geometry
 * (12px radius, 20px/18px padding, mono value at 26px/800).
 *
 * Two changes from the version this replaces. It no longer takes a
 * decorative accent — the dashboard previously passed a different hue to
 * each of four tiles purely for variety, so "Total XP" was gold and "Ideas
 * Tracked" was violet for no decodable reason; `tone` is now opt-in and
 * reserved for status. And the value is allowed to shrink and wrap: at a
 * fixed 26px, long values like "Thermodynamics Lv3" overflowed the tile.
 */
export function StatTile({ label, value, unit, sub, tone }: Props) {
  // Long values step down a size rather than overflowing.
  const size = value.length > 12 ? 16 : value.length > 8 ? 20 : 26;

  return (
    <div className="card card-hover flex min-w-0 flex-col gap-2" style={{ padding: "18px 16px" }}>
      <span className="label-xs truncate" title={label}>
        {label}
      </span>
      <span className="flex items-baseline gap-1.5">
        <span
          className="mono min-w-0 break-words"
          style={{
            fontSize: size,
            fontWeight: 800,
            lineHeight: 1.1,
            color: tone ? TONE[tone] : "var(--ink-0)",
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {unit}
          </span>
        )}
      </span>
      {sub && <span style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>{sub}</span>}
    </div>
  );
}
