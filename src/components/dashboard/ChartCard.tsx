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
 * Panel wrapper for a chart or list.
 *
 * Title is now title-case Inter at 11px rather than uppercase violet mono
 * with 0.15em tracking — per the ecosystem's typography rules, wide-tracked
 * all-caps mono is reserved for the single green section eyebrow, not for
 * every panel on the page.
 */
export function ChartCard({ title, subtitle, aside, children, className }: Props) {
  return (
    <section className={`card p-4 ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="panel-title">{title}</h3>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
