/**
 * PipStrip (ui-motion.md §4.5): a week's due days for a RAISE week quest.
 * Seven 12 px HTML day letters with counts; today outlined; past days ink-2.
 * role="img" with the full label (its letters and counts are presentational).
 * Static. Server-safe.
 *
 *   <PipStrip label="Due: Tuesday 1, Wednesday 2, Saturday 1" days={[{ key: "Mon", n: 0, past: true }, …]}/>
 */
import { cx } from "@/components/ui/cx";

export interface PipDay {
  /** "Mon" … "Sun". */
  key: string;
  /** Due that day (0 shows no count). */
  n: number;
  today?: boolean;
  past?: boolean;
  /** The letter shown (default the key's first letter). */
  letter?: string;
}

export function PipStrip({ days, label, className }: { days: readonly PipDay[]; label: string; className?: string }) {
  return (
    <span className={cx("mg-pp", className)} role="img" aria-label={label}>
      {days.map((d) => (
        <span key={d.key} className="mg-pp-d" data-day={d.key} data-today={d.today ? "" : undefined} data-past={d.past ? "" : undefined}>
          <b data-wc="name">{d.letter ?? d.key.slice(0, 1)}</b>
          <i>{d.n > 0 ? d.n : ""}</i>
        </span>
      ))}
    </span>
  );
}
