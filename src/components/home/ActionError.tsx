/**
 * A failed action, said once and plainly, in the kit's one error voice
 * (`.t-error` in styles/base.css: ink, 600, an ink diamond, role="alert").
 * Not --owed: that colour names debt (a penalty, a missed day), never a
 * request that did not go through. `.act-err` (you.css) only spaces it.
 *
 *   {error && <ActionError>{error}</ActionError>}
 */
import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";

export function ActionError({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p role="alert" className={cx("t-error", "act-err", className)}>
      {children}
    </p>
  );
}
