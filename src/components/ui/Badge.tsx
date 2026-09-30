/**
 * FROZEN CONTRACT — Badge (L0-foundation).
 *
 *   <Badge count={3} tone="ink|owed" pinned? label?/>
 *     18 px pill, 12/700. Ink for counts that ask something of you; owed ONLY for debt.
 *     Renders nothing at 0. `pinned` positions it on an icon-button or tab corner.
 */
import { cx } from "./cx";

export function Badge({
  count,
  tone = "ink",
  pinned,
  max = 99,
  label,
  className,
}: {
  count: number;
  tone?: "ink" | "owed";
  pinned?: boolean;
  max?: number;
  /** Screen-reader text; defaults to the number alone. */
  label?: string;
  className?: string;
}) {
  if (!count || count <= 0) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    <span className={cx("badge", tone === "owed" && "owed", pinned && "pinned", className)}>
      {label ? (
        <>
          <span aria-hidden="true">{text}</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        text
      )}
    </span>
  );
}
