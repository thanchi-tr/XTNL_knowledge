import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle?: string;
  /** Optional right-aligned figure or chip in the header row. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Chart chrome on the Sigil & Slate tokens (redesign.md › Charts): a card,
 * the diamond section header, a line-1 grid and ink-2 labels inside. A
 * single series is ink-0; several are ink with dash patterns and direct end
 * labels (palette.ts seriesDash). Hue is kept for state and currency.
 */
export function ChartCard({ title, subtitle, aside, children, className }: Props) {
  return (
    <section className={`card pad${className ? ` ${className}` : ""}`}>
      <div className="sec-h" style={{ padding: 0, marginBottom: 12 }}>
        <span className="lane-mark" aria-hidden="true" />
        <h3>{title}</h3>
        {(aside ?? subtitle) != null && <span className="aside">{aside ?? subtitle}</span>}
      </div>
      {children}
    </section>
  );
}
